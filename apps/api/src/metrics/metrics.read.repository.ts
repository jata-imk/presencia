import { Injectable } from "@nestjs/common";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { SocialNetwork } from "@presencia/shared";
import { postMetrics, publicationCards } from "../db/schema.js";
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
  async postsComparables(tx: Tx, desde: Date, hasta: Date): Promise<FilaComparable[]> {
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
        ),
      )
      .orderBy(distancia);

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
