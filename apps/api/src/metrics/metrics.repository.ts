import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
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
  /** Día del snapshot en UTC, `YYYY-MM-DD`. Lo calcula el servicio, no esta capa. */
  snapshotDate: string;
  capturedAt: Date;
  publishedAt: Date | null;
  raw: unknown;
  provider: string;
}

// Igual que en cards.repository.ts: la hora la pone el motor, no el proceso.
// Con `new Date()` la escritura que esperó el lock quedaría "más vieja" que la
// que la precedió.
const WRITTEN_AT = sql`clock_timestamp()`;

@Injectable()
export class MetricsRepository {
  /**
   * Un snapshot por post y día. El segundo pase del mismo día ACTUALIZA la
   * fila — es el invariante del DoD de F8.7 ("un segundo pase no duplica
   * filas") y lo garantiza el índice único, no el código que llama.
   *
   * El conflicto se resuelve por `(user_id, network, platform_post_id,
   * snapshot_date)` y no por la cuenta: reconectar una cuenta crea una fila
   * nueva en social_accounts, y llavear por ella duplicaría el mismo post.
   *
   * `card_id` y `social_account_id` se actualizan también, y a propósito: una
   * fila que entró por backfill (sin card) puede ganar una después, y la
   * cuenta puede haberse reconectado entre dos pases del mismo día.
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
        snapshotDate: input.snapshotDate,
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
          postMetrics.snapshotDate,
        ],
        set: {
          socialAccountId: input.socialAccountId,
          cardId: input.cardId,
          capturedAt: input.capturedAt,
          publishedAt: input.publishedAt,
          impressions: input.impressions,
          reach: input.reach,
          likes: input.likes,
          comments: input.comments,
          shares: input.shares,
          raw: input.raw,
          provider: input.provider,
          updatedAt: WRITTEN_AT,
        },
      });
  }
}
