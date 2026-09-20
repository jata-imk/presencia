import { Injectable } from "@nestjs/common";
import { desc, inArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { SocialNetwork } from "@presencia/shared";
import { postMetrics } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a post_metrics vive aquí (patrón de CardsRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.
//
// A diferencia de CardsRepository, acá NO hay `notifyChanged`: en F8.7 no
// existe superficie que muestre métricas, así que no hay nadie escuchando.
// Cuando llegue Analíticas (F12) habrá que decidir si vale la pena empujar
// estos cambios en vivo — un número de engagement que se mueve solo mientras
// el usuario mira la pantalla no es obviamente mejor que uno estable.

export type PostMetricsRow = typeof postMetrics.$inferSelect;

/** Lo que comparten todas las redes. `null` = la red no lo reportó, que no es 0. */
export interface NormalizedMetrics {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface UpsertSnapshotInput extends NormalizedMetrics {
  userId: string;
  socialAccountId: string | null;
  network: SocialNetwork;
  platformPostId: string;
  cardId: string | null;
  /** Inicio del bucket de la medición. Lo calcula `frescura.ts`, no esta capa. */
  snapshotAt: Date;
  capturedAt: Date;
  publishedAt: Date | null;
  raw: unknown;
  provider: string;
}

// Igual que en cards.repository.ts: la hora la pone el motor, no el proceso.
// Con `new Date()` la escritura que esperó el lock quedaría "más vieja" que la
// que la precedió.
const WRITTEN_AT = sql`clock_timestamp()`;

/**
 * En el UPDATE del conflicto: toma el valor nuevo si existe, conserva el
 * guardado si el nuevo es `NULL`.
 *
 * No es una precaución abstracta. "Publicó pero la red no dio métricas" es el
 * caso NORMAL (LinkedIn personal no las da nunca; X respondió 401 en la sonda
 * del 2026-09-17), y un pase que falle después de uno que funcionó llegaría
 * acá con todo en `null`. Sin esto, el índice único convertiría ese fallo en
 * un UPDATE que borra el único número bueno del día, sin forma de
 * recuperarlo: el proveedor ya no lo tiene, era un snapshot.
 *
 * Un contador no baja a "desconocido": si la red reportó 210 impresiones a las
 * 06:00, esos 210 siguen siendo ciertos a las 18:00 aunque la llamada truene.
 */
function conservaSiFalta(columna: PgColumn) {
  return sql`coalesce(excluded.${sql.identifier(columna.name)}, ${columna})`;
}

@Injectable()
export class MetricsRepository {
  /**
   * Último bucket medido de cada post, para la política de frescura.
   *
   * Se lee DENTRO del tenant (la tabla tiene RLS), así que solo devuelve los
   * posts de ese usuario aunque la lista venga de un barrido global. Un post
   * ausente del Map es uno que nunca se midió.
   */
  async lastBuckets(tx: Tx, platformPostIds: readonly string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (platformPostIds.length === 0) return result;
    const filas = await tx
      .select({
        platformPostId: postMetrics.platformPostId,
        snapshotAt: postMetrics.snapshotAt,
      })
      .from(postMetrics)
      .where(inArray(postMetrics.platformPostId, [...platformPostIds]))
      .orderBy(desc(postMetrics.snapshotAt));
    // Orden descendente + primer gana: el máximo por post sin GROUP BY.
    for (const fila of filas) {
      if (!result.has(fila.platformPostId)) result.set(fila.platformPostId, fila.snapshotAt);
    }
    return result;
  }

  /**
   * Un snapshot por post y bucket de tiempo. Un segundo pase DENTRO DEL MISMO
   * bucket ACTUALIZA la fila — es el invariante del DoD de F8.7 ("un segundo
   * pase no duplica filas") y lo garantiza el índice único, no el código que
   * llama.
   *
   * El conflicto se resuelve por `(user_id, network, platform_post_id,
   * snapshot_at)` y no por la cuenta: `social_account_id` es nullable (y un
   * NULL no colisiona en un índice único) y su fila cambia de id si la cuenta
   * se borra y se vuelve a conectar. Ver el docblock de la tabla.
   *
   * `card_id` y `social_account_id` se actualizan también, y a propósito: una
   * fila que entró por backfill (sin card) puede ganar una después, y la
   * cuenta puede haber cambiado entre dos pases.
   *
   * Todo lo que puede venir vacío pasa por `conservaSiFalta`: un pase fallido
   * no borra lo que ya se sabía. Lo que sí se pisa siempre es `raw` (queremos
   * el motivo del último intento), `captured_at` y `provider`.
   *
   * `provider` NO es parte de la llave. Hoy no puede serlo sin romper el
   * invariante del DoD: dos proveedores para la misma red darían dos filas
   * del mismo día. Y hoy tampoco hace falta — `PUBLISHING_PROVIDER` es una
   * sola variable global, así que en un momento dado hay exactamente un
   * proveedor por instalación. Si eso cambiara (un proveedor por red, por
   * ejemplo), hay que volver acá: la serie de un post mezclaría números que
   * el comentario de `schema.ts` dice que no siempre son comparables.
   */
  async upsertSnapshot(tx: Tx, input: UpsertSnapshotInput): Promise<void> {
    await tx
      .insert(postMetrics)
      .values({
        userId: input.userId,
        socialAccountId: input.socialAccountId,
        network: input.network,
        platformPostId: input.platformPostId,
        cardId: input.cardId,
        snapshotAt: input.snapshotAt,
        capturedAt: input.capturedAt,
        publishedAt: input.publishedAt,
        impressions: input.impressions,
        reach: input.reach,
        likes: input.likes,
        comments: input.comments,
        shares: input.shares,
        raw: input.raw,
        provider: input.provider,
      })
      .onConflictDoUpdate({
        target: [
          postMetrics.userId,
          postMetrics.network,
          postMetrics.platformPostId,
          postMetrics.snapshotAt,
        ],
        set: {
          socialAccountId: conservaSiFalta(postMetrics.socialAccountId),
          cardId: conservaSiFalta(postMetrics.cardId),
          capturedAt: input.capturedAt,
          publishedAt: conservaSiFalta(postMetrics.publishedAt),
          impressions: conservaSiFalta(postMetrics.impressions),
          reach: conservaSiFalta(postMetrics.reach),
          likes: conservaSiFalta(postMetrics.likes),
          comments: conservaSiFalta(postMetrics.comments),
          shares: conservaSiFalta(postMetrics.shares),
          raw: input.raw,
          provider: input.provider,
          updatedAt: WRITTEN_AT,
        },
      });
  }
}
