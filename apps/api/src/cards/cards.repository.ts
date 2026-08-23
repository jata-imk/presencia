import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import type { CardContent, CardStatus, SocialNetwork } from "@presencia/shared";
import { chats, publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a publication_cards vive aquí (patrón de ChatRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type CardRow = typeof publicationCards.$inferSelect;

export interface MarkSchedulingInput {
  socialAccountId: string;
  scheduledAt: Date;
}

/** Filtros del popover del Calendario. Todos opcionales; ausente = sin filtrar. */
export interface CalendarFilters {
  status?: CardStatus[];
  network?: SocialNetwork[];
  folderId?: string;
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
   * Igual que markFailed pero para varias cards con el MISMO errorDetail
   * de una sola vez (code review 2026-08-20) — reconcileDueCards llamaba
   * markFailed en un for-loop, una transacción por card huérfana/fallida;
   * cuando todas comparten el mismo motivo (típico: "no confirmó nada"),
   * es un solo UPDATE ... WHERE id = ANY(...) real, no N transacciones.
   */
  async markManyFailed(tx: Tx, ids: string[], errorDetail: unknown): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ status: "failed", errorDetail, updatedAt: new Date() })
      .where(inArray(publicationCards.id, ids));
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

  /**
   * F7: todo lo que cae en el rango visible del Calendario, en cualquier
   * estado. Hermana de findConflicts, no un reemplazo: aquella responde
   * "¿choca con algo ya programado?" (solo `scheduled`) y la consume el
   * ScheduleDrawer; esta responde "¿qué hay en pantalla?".
   *
   * Pega contra el índice `cards_calendar (user_id, scheduled_at)`. El
   * user_id no aparece en el WHERE porque lo pone el RLS, pero sigue siendo
   * la primera columna del índice: el planner lo usa igual.
   *
   * Sin paginación a propósito: el rango es un mes (o una semana, o un día),
   * acotado por construcción. Si algún día un mes trae miles de cards, el
   * corte natural es por rango más chico, no por offset.
   */
  async listByRange(
    tx: Tx,
    from: Date,
    to: Date,
    filters: CalendarFilters = {},
  ): Promise<CardRow[]> {
    const conditions = [
      gte(publicationCards.scheduledAt, from),
      lte(publicationCards.scheduledAt, to),
    ];
    if (filters.status?.length) {
      conditions.push(inArray(publicationCards.status, filters.status));
    }
    if (filters.network?.length) {
      conditions.push(inArray(publicationCards.network, filters.network));
    }

    const base = tx.select(getTableColumns(publicationCards)).from(publicationCards).$dynamic();
    // La carpeta vive en el chat que originó la card, no en la card. El join
    // es INNER a propósito: una card huérfana (chat eliminado, chat_id null)
    // no tiene carpeta de la cual derivar, así que no matchea ningún filtro
    // por carpeta — desaparece del listado filtrado, y eso es correcto.
    const filtered = filters.folderId
      ? base
          .innerJoin(chats, eq(publicationCards.chatId, chats.id))
          .where(and(...conditions, eq(chats.folderId, filters.folderId)))
      : base.where(and(...conditions));

    // Desempate por createdAt: las N redes de un grupo multi-red comparten
    // scheduled_at exacto, y sin segundo criterio Postgres puede devolverlas
    // en orden distinto entre requests — el grupo "bailaría" al refrescar.
    return filtered.orderBy(asc(publicationCards.scheduledAt), asc(publicationCards.createdAt));
  }

  /**
   * F7: la bandeja de borradores del panel izquierdo — cards creadas en Chat
   * que todavía no tienen fecha. `scheduled_at IS NULL` además del estado:
   * cancelSchedule() devuelve la card a `draft` pero limpia scheduled_at, así
   * que la condición es redundante hoy; se deja explícita porque el panel
   * promete "sin fecha programada" y esa promesa no debe depender de que
   * ningún otro camino olvide limpiar la columna.
   */
  async listDrafts(tx: Tx): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(and(eq(publicationCards.status, "draft"), isNull(publicationCards.scheduledAt)))
      .orderBy(desc(publicationCards.createdAt));
  }
}
