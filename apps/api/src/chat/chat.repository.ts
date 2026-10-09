import { Injectable } from "@nestjs/common";
import { and, asc, cosineDistance, desc, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { chatSummaries, chats, memoryChunks, messages } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";
import { CHAT_CHANGED_CHANNEL, encodeChatChanged } from "../realtime/card-events.js";

// Todo acceso a chats/messages vive aquí (contrato de modelo-de-datos.md:
// el shape UIMessage persistido queda encapsulado en el repository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ChatSummaryRow = typeof chatSummaries.$inferSelect;

@Injectable()
export class ChatRepository {
  async createChat(tx: Tx, userId: string, title?: string): Promise<ChatRow> {
    const [chat] = await tx
      .insert(chats)
      // Un título que se manda al crear es del creator: el automático no lo toca.
      .values({ userId, ...(title ? { title, titleSource: "user" as const } : {}) })
      .returning();
    if (!chat) throw new Error("No se pudo crear el chat");
    return chat;
  }

  // Archivados no salen en "Recientes" (F6 PR8) — tienen su propia lista
  // (listArchivedChats), como en el mockup (ArchivedView es una pantalla
  // aparte, no un filtro dentro de la misma).
  listChats(tx: Tx): Promise<ChatRow[]> {
    return tx
      .select()
      .from(chats)
      .where(isNull(chats.archivedAt))
      .orderBy(
        // `nulls last` explícito NO es opcional: en Postgres DESC implica
        // NULLS FIRST, así que sin esto los chats SIN fijar quedarían
        // arriba de los fijados — y con pocos chats en dev el bug pasa
        // desapercibido.
        sql`${chats.pinnedAt} desc nulls last`,
        desc(sql`coalesce(${chats.lastMessageAt}, ${chats.createdAt})`),
      );
  }

  listArchivedChats(tx: Tx): Promise<ChatRow[]> {
    return tx
      .select()
      .from(chats)
      .where(isNotNull(chats.archivedAt))
      .orderBy(desc(chats.archivedAt));
  }

  async getChat(tx: Tx, chatId: string): Promise<ChatRow | undefined> {
    const [chat] = await tx.select().from(chats).where(eq(chats.id, chatId));
    return chat;
  }

  listMessages(tx: Tx, chatId: string): Promise<MessageRow[]> {
    return tx
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
  }

  async insertMessage(
    tx: Tx,
    input: {
      chatId: string;
      userId: string;
      role: "user" | "assistant";
      parts: unknown;
    },
  ): Promise<MessageRow> {
    const [message] = await tx.insert(messages).values(input).returning();
    if (!message) throw new Error("No se pudo guardar el mensaje");
    return message;
  }

  async touchChat(tx: Tx, chatId: string): Promise<void> {
    await tx
      .update(chats)
      .set({ lastMessageAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(chats.id, chatId));
  }

  /** F10.8: el resumen del tramo viejo del chat, si ya se compactó. */
  async getSummary(tx: Tx, chatId: string): Promise<ChatSummaryRow | undefined> {
    const [row] = await tx.select().from(chatSummaries).where(eq(chatSummaries.chatId, chatId));
    return row;
  }

  /**
   * Guarda el resumen SOLO si avanza: si ya hay uno que cubre hasta un mensaje
   * igual o posterior (otro job que corrió a la vez), no lo pisa con uno más
   * corto. `false` si no se escribió; quien llama no cobra en ese caso.
   */
  async saveSummary(tx: Tx, row: Omit<ChatSummaryRow, "updatedAt">): Promise<boolean> {
    const saved = await tx
      .insert(chatSummaries)
      .values(row)
      .onConflictDoUpdate({
        target: chatSummaries.chatId,
        set: {
          summary: row.summary,
          throughMessageId: row.throughMessageId,
          throughCreatedAt: row.throughCreatedAt,
          cards: row.cards,
          model: row.model,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${chatSummaries.throughCreatedAt} < excluded.through_created_at`,
      })
      .returning({ chatId: chatSummaries.chatId });
    return saved.length > 0;
  }

  /** F10.8: ¿ese intercambio ya tiene su fragmento de memoria? */
  /**
   * F10.8: una respuesta y el mensaje que la precede en su chat, el
   * intercambio que indexa la memoria, sin leer el chat entero. null si la
   * respuesta ya no existe (se regeneró o se borró el chat).
   */
  async findExchange(
    tx: Tx,
    chatId: string,
    messageId: string,
  ): Promise<{ reply: MessageRow; previous: MessageRow | undefined } | null> {
    const [reply] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)));
    if (!reply) return null;
    const [previous] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), lt(messages.createdAt, reply.createdAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return { reply, previous };
  }

  async hasMemoryChunk(tx: Tx, messageId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: memoryChunks.id })
      .from(memoryChunks)
      .where(eq(memoryChunks.messageId, messageId));
    return Boolean(row);
  }

  /** F10.8: guarda un fragmento; uno solo por respuesta (índice único). */
  async insertMemoryChunk(
    tx: Tx,
    row: Omit<typeof memoryChunks.$inferInsert, "id" | "createdAt">,
  ): Promise<void> {
    await tx.insert(memoryChunks).values(row).onConflictDoNothing();
  }

  /**
   * F10.8: los fragmentos más parecidos a `embedding` en los OTROS chats del
   * usuario (RLS), del modelo vigente. Con `hnsw.iterative_scan`: el índice
   * es global y el filtro por usuario y chat se aplica después, así que sin
   * esto podría devolver menos resultados de los que hay (pgvector ≥ 0.8).
   */
  async searchMemory(
    tx: Tx,
    input: { chatId: string; model: string; embedding: number[]; limit: number },
  ): Promise<{ content: string; chatTitle: string; createdAt: Date; similarity: number }[]> {
    await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
    const distance = cosineDistance(memoryChunks.embedding, input.embedding);
    const rows = await tx
      .select({
        content: memoryChunks.content,
        chatTitle: chats.title,
        createdAt: memoryChunks.createdAt,
        distance,
      })
      .from(memoryChunks)
      .innerJoin(chats, eq(chats.id, memoryChunks.chatId))
      .where(and(ne(memoryChunks.chatId, input.chatId), eq(memoryChunks.model, input.model)))
      .orderBy(distance)
      .limit(input.limit);
    // relaxed_order puede devolverlos casi en orden: se ordena aquí de nuevo.
    return rows
      .map((r) => ({
        content: r.content,
        chatTitle: r.chatTitle,
        createdAt: r.createdAt,
        similarity: 1 - Number(r.distance),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }

  async deleteMessage(tx: Tx, messageId: string): Promise<void> {
    await tx.delete(messages).where(eq(messages.id, messageId));
  }

  /**
   * El creator lo renombró: desde aquí el título es suyo (`user`) y el
   * automático ya no lo toca, ni el que estuviera en camino (setAutoTitle).
   */
  async renameChat(tx: Tx, chatId: string, title: string): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({ title, titleSource: "user", updatedAt: sql`now()` })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo renombrar el chat");
    await this.notifyChanged(tx, chat);
    return chat;
  }

  /**
   * F10.8: el título que propuso el modelo, SOLO si el chat sigue con el de
   * nacimiento. La condición va en el mismo UPDATE, no en una lectura previa:
   * si el creator lo renombra mientras el modelo pensaba, gana el creator.
   * `undefined` si no se escribió (ya tenía título).
   */
  async setAutoTitle(tx: Tx, chatId: string, title: string): Promise<ChatRow | undefined> {
    const [chat] = await tx
      .update(chats)
      .set({ title, titleSource: "auto", updatedAt: sql`now()` })
      .where(and(eq(chats.id, chatId), eq(chats.titleSource, "default")))
      .returning();
    if (chat) await this.notifyChanged(tx, chat);
    return chat;
  }

  /**
   * NOTIFY transaccional (F8.6, F10.8): Postgres lo entrega solo si hay
   * COMMIT, así que ninguna pestaña ve un título que no quedó guardado.
   */
  private async notifyChanged(tx: Tx, chat: ChatRow): Promise<void> {
    const payload = encodeChatChanged({ userId: chat.userId, chatId: chat.id });
    await tx.execute(sql`select pg_notify(${CHAT_CHANGED_CHANNEL}, ${payload})`);
  }

  // Archivar limpia el pin en el MISMO update (y el CHECK
  // chats_not_pinned_and_archived lo respalda): las dos cosas se
  // contradicen. Desarchivar no lo restaura a propósito — resucitar un pin
  // que el usuario ya olvidó, desde una pantalla (Archivados) que ni
  // siquiera muestra el estado de fijado, sería un efecto invisible.
  async setArchived(tx: Tx, chatId: string, archived: boolean): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({
        archivedAt: archived ? sql`now()` : null,
        ...(archived ? { pinnedAt: null } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo archivar/desarchivar el chat");
    return chat;
  }

  async setPinned(tx: Tx, chatId: string, pinned: boolean): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({ pinnedAt: pinned ? sql`now()` : null, updatedAt: sql`now()` })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo fijar/desfijar el chat");
    return chat;
  }

  async moveToFolder(tx: Tx, chatId: string, folderId: string | null): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({ folderId, updatedAt: sql`now()` })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo mover el chat de carpeta");
    return chat;
  }

  // messages.chatId es onDelete:"cascade" — se borran solos. publication_
  // cards.chatId es onDelete:"set null" (F6 PR8) — sobreviven huérfanas;
  // ChatService.deleteChat ya validó antes de llegar acá que no hay
  // ninguna "scheduled" entre ellas.
  async deleteChat(tx: Tx, chatId: string): Promise<void> {
    await tx.delete(chats).where(eq(chats.id, chatId));
  }
}
