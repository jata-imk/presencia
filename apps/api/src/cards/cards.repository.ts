import { Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a publication_cards vive aquí (patrón de ChatRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type CardRow = typeof publicationCards.$inferSelect;

export interface MarkSchedulingInput {
  socialAccountId: string;
  scheduledAt: Date;
}

@Injectable()
export class CardsRepository {
  async insertCard(
    tx: Tx,
    input: {
      userId: string;
      chatId: string;
      network: SocialNetwork;
      content: CardContent;
      groupId?: string | null;
    },
  ): Promise<CardRow> {
    // archetype se deriva de content.archetype (nunca un parámetro aparte):
    // hace imposible insertar una fila con archetype y content desalineados.
    const [card] = await tx
      .insert(publicationCards)
      .values({ ...input, archetype: input.content.archetype })
      .returning();
    if (!card) throw new Error("No se pudo crear la card de publicación");
    return card;
  }

  // La card nace durante el stream, antes de que exista el mensaje assistant
  // (que se inserta en onEnd) — backfill de message_id una vez que sí existe.
  async linkCardsToMessage(tx: Tx, cardIds: string[], messageId: string): Promise<void> {
    if (cardIds.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ messageId, updatedAt: new Date() })
      .where(inArray(publicationCards.id, cardIds));
  }

  // Se llama ANTES de borrar el mensaje (FK message_id es "set null", no
  // cascade): sin este paso las cards quedarían huérfanas en vez de
  // borradas al reintentar un turno (decisión de producto, F3 PR3).
  async deleteCardsByMessageId(tx: Tx, messageId: string): Promise<void> {
    await tx.delete(publicationCards).where(eq(publicationCards.messageId, messageId));
  }

  // ── F6: ciclo de vida (programar/reprogramar/cancelar/reconciliar) ────

  async findById(tx: Tx, id: string): Promise<CardRow | undefined> {
    const [row] = await tx.select().from(publicationCards).where(eq(publicationCards.id, id));
    return row;
  }

  async listByChat(tx: Tx, chatId: string): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(eq(publicationCards.chatId, chatId))
      .orderBy(publicationCards.createdAt);
  }

  /**
   * Usado por ChatService.deleteChat (F6 PR8): borrar un chat con cards
   * "scheduled" cancelaría un post real en postfa.st sin que nadie lo haya
   * pedido — se rechaza el borrado en vez de cancelar en silencio.
   */
  async hasScheduledCards(tx: Tx, chatId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: publicationCards.id })
      .from(publicationCards)
      .where(and(eq(publicationCards.chatId, chatId), eq(publicationCards.status, "scheduled")))
      .limit(1);
    return row !== undefined;
  }

  /**
   * Mismo criterio que hasScheduledCards pero por cuenta conectada — usado
   * por ChannelsService.deleteAccount (borrado permanente, F6 follow-up):
   * borrar la cuenta es seguro para el schema (social_account_id es "set
   * null"), pero borrarla con una card "scheduled" apuntándole dejaría un
   * compromiso real en postfa.st sin cuenta local que lo referencie.
   */
  async hasScheduledCardsForAccount(tx: Tx, socialAccountId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: publicationCards.id })
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.socialAccountId, socialAccountId),
          eq(publicationCards.status, "scheduled"),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Primer paso de programar/reprogramar: fija destino y horario, deja
   * `provider_ref` en null a propósito — CardsService lo llena en una
   * segunda transacción SOLO si la llamada al proveedor tuvo éxito
   * (invariante DB↔PostFast: nunca queda "scheduled" con una llamada que
   * en realidad falló a medio camino).
   */
  async markScheduling(tx: Tx, id: string, input: MarkSchedulingInput): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "scheduled",
        socialAccountId: input.socialAccountId,
        scheduledAt: input.scheduledAt,
        providerRef: null,
        errorDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo programar la publicación");
    return row;
  }

  async attachProviderRef(tx: Tx, id: string, providerRef: string): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ providerRef, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo confirmar la programación de la publicación");
    return row;
  }

  /**
   * Variante de attachProviderRef con guardia `status = 'scheduled'`
   * (code review 2026-08-20 — race real): entre que schedule() marca
   * "scheduled" y la llamada de red al proveedor resuelve, cancelSchedule()
   * puede correr sobre la misma card mientras `provider_ref` sigue null —
   * su guard `if (card.providerRef)` no ve nada que cancelar del lado del
   * proveedor y la deja en "draft". Si attachProviderRef corriera sin
   * condición después, estamparía un providerRef real sobre esa fila
   * "draft" — un post de verdad en PostFast sin ninguna card "scheduled"
   * que lo referencie (reconcileDueCards tampoco lo encuentra, solo mira
   * status='scheduled'). Con la guardia, si la fila ya no está
   * "scheduled", el UPDATE no afecta ninguna fila y el caller (ver
   * CardsService.schedule) sabe que debe cancelar el post huérfano en vez
   * de asumir que se programó.
   */
  async attachProviderRefIfScheduled(
    tx: Tx,
    id: string,
    providerRef: string,
  ): Promise<CardRow | undefined> {
    const [row] = await tx
      .update(publicationCards)
      .set({ providerRef, updatedAt: new Date() })
      .where(and(eq(publicationCards.id, id), eq(publicationCards.status, "scheduled")))
      .returning();
    return row;
  }

  /** El schedule() al proveedor falló tras marcar "scheduled" — vuelve a draft sin destino. */
  async resetToDraft(tx: Tx, id: string, errorDetail: unknown): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "draft",
        socialAccountId: null,
        scheduledAt: null,
        providerRef: null,
        errorDetail,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo revertir la publicación a borrador");
    return row;
  }

  /** Cancelar programación (decisión de producto, presencia-chat.md): vuelve a draft, no a "canceled". */
  async cancelSchedule(tx: Tx, id: string): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "draft",
        socialAccountId: null,
        scheduledAt: null,
        providerRef: null,
        errorDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo cancelar la programación");
    return row;
  }

  async markPublished(tx: Tx, id: string, publishedAt: Date): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ status: "published", publishedAt, errorDetail: null, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo marcar la publicación como publicada");
    return row;
  }

  /** Fallo terminal (proveedor confirmó FAILED, o nunca confirmó nada) — se queda visible, no vuelve a draft solo. */
  async markFailed(tx: Tx, id: string, errorDetail: unknown): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ status: "failed", errorDetail, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo marcar la publicación como fallida");
    return row;
  }

  /**
   * Cards que llevan más de `cutoff` en "scheduled" sin `provider_ref` —
   * la llamada al proveedor nunca llegó a confirmarse (el proceso murió
   * entre markScheduling y attachProviderRef). No importa cuándo estaban
   * programadas: nunca van a publicarse porque PostFast nunca las recibió.
   */
  async listOrphanedScheduled(tx: Tx, updatedBefore: Date): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          isNull(publicationCards.providerRef),
          lt(publicationCards.updatedAt, updatedBefore),
        ),
      );
  }

  /** Cards "scheduled" cuya hora ya pasó y sí tienen provider_ref — hay que preguntarle a PostFast qué pasó. */
  async listDueScheduled(tx: Tx, scheduledBefore: Date): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          lt(publicationCards.scheduledAt, scheduledBefore),
        ),
      );
  }

  async findConflicts(tx: Tx, from: Date, to: Date): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          gte(publicationCards.scheduledAt, from),
          lte(publicationCards.scheduledAt, to),
        ),
      );
  }
}
