import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { PublicationArchetype, SocialNetwork } from "@presencia/shared";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { chats, folders, postMetrics, publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";
import { EDAD_REFERENCIA_HORAS, TOLERANCIA_HORAS } from "./engagement.js";

// El camino de LECTURA de las métricas. `MetricsRepository` solo escribe (lo
// que el job necesita); acá vive lo que alguien consulta.
//
// Están separados a propósito: son dos ciclos de vida distintos. La escritura
// la usa un worker cada hora y no puede fallar en silencio; la lectura la usa
// un request de usuario y puede degradarse. Mezclarlas haría que un cambio
// pensado para el dashboard tocara el archivo del que depende la ingesta.
//
// Ninguna query filtra por `user_id`: el RLS de la transacción es el filtro
// (ADR-003), igual que en el resto de los repositorios.

/** Una fila por post: el snapshot elegido como punto comparable. */
export interface FilaComparable {
  network: SocialNetwork;
  platformPostId: string;
  publishedAt: Date;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/** Una publicación de Analíticas: la card publicada con lo que su fila pinta. */
export interface FilaPublicacionAnalizable {
  cardId: string;
  network: SocialNetwork;
  archetype: PublicationArchetype;
  /** `CardContent` sin validar: el servicio lo lee para texto y miniatura. */
  content: unknown;
  groupId: string | null;
  chatId: string | null;
  carpeta: { nombre: string; icono: string | null } | null;
  postUrl: string | null;
  platformPostId: string | null;
  publishedAt: Date;
}

/** El último número de cada métrica de un post (ver `ultimosNumeros`). */
export interface FilaUltimosNumeros {
  network: SocialNetwork;
  platformPostId: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  medidoEn: Date | null;
  snapshots: number;
}

/** Una publicación contada para el heatmap de cadencia. */
export interface FilaPublicacion {
  network: SocialNetwork;
  publishedAt: Date;
}

@Injectable()
export class MetricsReadRepository {
  /**
   * Un punto por post: el snapshot tomado más cerca de las 24 h de vida.
   *
   * Tres filtros que no son opcionales:
   *
   * - `published_at is not null` — la columna es nullable (hay filas de
   *   backfill que pueden no tenerla) y sin hora de publicación este post no
   *   puede decir nada sobre horarios.
   * - El post tiene que haber cumplido la edad de referencia. Uno de dos horas
   *   no ha terminado de acumular; incluirlo castigaría a la hora en la que se
   *   publicó por el solo hecho de ser reciente.
   * - La medición tiene que caer dentro de la tolerancia. Si la ingesta se
   *   saltó ese tramo (el worker estuvo caído, el proveedor devolvió error),
   *   el snapshot más cercano puede ser de los 8 días: existe, pero no es
   *   comparable con los demás y entra silenciosamente sesgando todo hacia
   *   arriba.
   *
   * Los posts sin ningún número (los cinco `null`) SÍ vuelven: que una red no
   * reporte es un hecho que el motor necesita para distinguir "no publicaste"
   * de "publicaste y la red no dice nada" (ADR-009). Filtrarlos acá volvería
   * esos dos casos indistinguibles.
   */
  async postsComparables(
    tx: Tx,
    desde: Date,
    hasta: Date,
    /** Solo estos posts (el detalle de Analíticas); sin él, todos los del rango. */
    platformPostIds?: readonly string[],
  ): Promise<FilaComparable[]> {
    if (platformPostIds?.length === 0) return [];
    const distancia = sql`abs(extract(epoch from (${postMetrics.capturedAt} - (${postMetrics.publishedAt} + make_interval(hours => ${EDAD_REFERENCIA_HORAS})))))`;
    const filas = await tx
      .select({
        network: postMetrics.network,
        platformPostId: postMetrics.platformPostId,
        publishedAt: postMetrics.publishedAt,
        reach: postMetrics.reach,
        likes: postMetrics.likes,
        comments: postMetrics.comments,
        shares: postMetrics.shares,
      })
      .from(postMetrics)
      .where(
        and(
          isNotNull(postMetrics.publishedAt),
          gte(postMetrics.publishedAt, desde),
          // El piso de edad va explícito y no delegado a la tolerancia. Sin
          // él, un post de 19 h entra con su medición de 18.5 h —cae dentro de
          // la ventana simétrica— y compite contra otros medidos a las 24: su
          // franja sale castigada por la sola razón de ser reciente. La
          // tolerancia existe para los huecos de ingesta, no para esto.
          lte(
            postMetrics.publishedAt,
            new Date(hasta.getTime() - EDAD_REFERENCIA_HORAS * 3600_000),
          ),
          sql`${distancia} <= ${TOLERANCIA_HORAS * 3600}`,
          platformPostIds ? inArray(postMetrics.platformPostId, [...platformPostIds]) : undefined,
        ),
      )
      // El desempate no es cosmético. Dos mediciones a la misma distancia (a
      // las 21 h y a las 27 h) son comunes con buckets de 6 h, y sin segundo
      // criterio ganaba la que Postgres devolviera primero, que depende del
      // plan: la misma publicación salía con un "+%" distinto según el rango
      // pedido (la tabla de Analíticas decía +56% y su detalle +55%). Gana la
      // posterior, la que ya cumplió la edad (mismo criterio que el piso).
      .orderBy(distancia, desc(postMetrics.capturedAt));

    // El "uno por post" se resuelve acá y no con `distinct on` porque este
    // repositorio se lee dentro de un request y la ventana es de 30 días: son
    // decenas de filas, no millones. Si algún día la ventana crece, el cambio
    // es mover este bloque a un `distinct on (network, platform_post_id)` con
    // la distancia como primer criterio de orden.
    const elegidos = new Map<string, FilaComparable>();
    for (const fila of filas) {
      const clave = `${fila.network}:${fila.platformPostId}`;
      if (elegidos.has(clave)) continue;
      // `publishedAt` no es null: la query lo filtra, pero el tipo de drizzle
      // no lo sabe.
      if (!fila.publishedAt) continue;
      elegidos.set(clave, { ...fila, publishedAt: fila.publishedAt });
    }
    return [...elegidos.values()];
  }

  /**
   * Las cards publicadas en un rango, con lo que Analíticas pinta de cada una.
   *
   * Sale de `publication_cards` por la misma razón que la cadencia: "publiqué"
   * no depende de que la red conteste. La carpeta viene del chat de origen;
   * un chat borrado deja la card huérfana (`chat_id` null) y sin carpeta.
   */
  async publicacionesAnalizables(
    tx: Tx,
    desde: Date,
    hasta: Date,
  ): Promise<FilaPublicacionAnalizable[]> {
    return this.leerAnalizables(
      tx,
      and(gte(publicationCards.publishedAt, desde), lte(publicationCards.publishedAt, hasta)),
    );
  }

  /**
   * Una card publicada y sus hermanas publicadas del mismo concepto
   * (`group_id`): el panel de detalle, que puede abrir una publicación más
   * vieja que el periodo elegido.
   */
  async publicacionYHermanas(tx: Tx, cardId: string): Promise<FilaPublicacionAnalizable[]> {
    return this.leerAnalizables(
      tx,
      or(
        eq(publicationCards.id, cardId),
        sql`${publicationCards.groupId} = (select group_id from publication_cards where id = ${cardId})`,
      ),
    );
  }

  private async leerAnalizables(
    tx: Tx,
    filtro: SQL | undefined,
  ): Promise<FilaPublicacionAnalizable[]> {
    const filas = await tx
      .select({
        cardId: publicationCards.id,
        network: publicationCards.network,
        archetype: publicationCards.archetype,
        content: publicationCards.content,
        groupId: publicationCards.groupId,
        chatId: publicationCards.chatId,
        carpetaNombre: folders.name,
        carpetaIcono: folders.icon,
        postUrl: publicationCards.postUrl,
        platformPostId: publicationCards.platformPostId,
        publishedAt: publicationCards.publishedAt,
      })
      .from(publicationCards)
      .leftJoin(chats, eq(chats.id, publicationCards.chatId))
      .leftJoin(folders, eq(folders.id, chats.folderId))
      .where(
        and(
          eq(publicationCards.status, "published"),
          isNotNull(publicationCards.publishedAt),
          filtro,
        ),
      );
    return filas.flatMap(({ carpetaNombre, carpetaIcono, publishedAt, ...fila }) =>
      publishedAt
        ? [
            {
              ...fila,
              publishedAt,
              carpeta: carpetaNombre ? { nombre: carpetaNombre, icono: carpetaIcono } : null,
            },
          ]
        : [],
    );
  }

  /** ¿Publicó algo alguna vez? Distingue "Cero absoluto" de "nada en el periodo". */
  async hayPublicadas(tx: Tx): Promise<boolean> {
    const [fila] = await tx
      .select({ id: publicationCards.id })
      .from(publicationCards)
      .where(eq(publicationCards.status, "published"))
      .limit(1);
    return fila !== undefined;
  }

  /**
   * El último número que la red dio de cada métrica, columna por columna: lo
   * que Analíticas muestra como total ("lo que ves hoy").
   *
   * Por columna y no "el último snapshot": un bucket nuevo puede traer `null`
   * en una métrica que la red sí dio antes, y ese `null` no borra el número
   * (addendum F12 de ADR-022). `medidoEn` es la medición más reciente, traiga
   * números o no: es "Medido hace 3 horas".
   *
   * Filtra por los ids de las cards que ya se leyeron, no por
   * `post_metrics.published_at`: esa columna puede venir nula en filas de
   * backfill, y filtrar por ella dejaría a su card sin números.
   */
  async ultimosNumeros(tx: Tx, platformPostIds: readonly string[]): Promise<FilaUltimosNumeros[]> {
    if (platformPostIds.length === 0) return [];
    const numero = (valor: unknown) => (valor === null ? null : Number(valor));
    const ultimo = (columna: AnyPgColumn) =>
      sql<
        number | null
      >`(array_agg(${columna} order by ${postMetrics.snapshotAt} desc) filter (where ${columna} is not null))[1]`.mapWith(
        numero,
      );
    return tx
      .select({
        network: postMetrics.network,
        platformPostId: postMetrics.platformPostId,
        reach: ultimo(postMetrics.reach),
        impressions: ultimo(postMetrics.impressions),
        likes: ultimo(postMetrics.likes),
        comments: ultimo(postMetrics.comments),
        shares: ultimo(postMetrics.shares),
        medidoEn: sql<Date | null>`max(${postMetrics.capturedAt})`.mapWith(postMetrics.capturedAt),
        snapshots: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(postMetrics)
      .where(inArray(postMetrics.platformPostId, [...platformPostIds]))
      .groupBy(postMetrics.network, postMetrics.platformPostId);
  }

  /**
   * Las publicaciones del periodo, para el heatmap de cadencia.
   *
   * Sale de `publication_cards` y no de `post_metrics`, y la diferencia
   * importa: la cadencia es "publiqué", no "me midieron". Un post en una red
   * que no reporta métricas no tiene una sola fila en `post_metrics` con
   * números, pero sí ocurrió — y la racha del usuario no puede depender de si
   * LinkedIn quiso contestar.
   */
  async publicacionesPublicadas(tx: Tx, desde: Date, hasta: Date): Promise<FilaPublicacion[]> {
    const filas = await tx
      .select({
        network: publicationCards.network,
        publishedAt: publicationCards.publishedAt,
      })
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "published"),
          isNotNull(publicationCards.publishedAt),
          gte(publicationCards.publishedAt, desde),
          lte(publicationCards.publishedAt, hasta),
        ),
      );
    return filas.flatMap((fila) =>
      fila.publishedAt ? [{ network: fila.network, publishedAt: fila.publishedAt }] : [],
    );
  }
}
