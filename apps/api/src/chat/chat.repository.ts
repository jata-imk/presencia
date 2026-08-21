import { Injectable } from "@nestjs/common";
import { asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { chats, messages } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a chats/messages vive aquí (contrato de modelo-de-datos.md:
// el shape UIMessage persistido queda encapsulado en el repository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type ChatRow = typeof chats.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

@Injectable()
export class ChatRepository {
  async createChat(tx: Tx, userId: string, title?: string): Promise<ChatRow> {
    const [chat] = await tx
      .insert(chats)
      .values({ userId, ...(title ? { title } : {}) })
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
      .orderBy(desc(sql`coalesce(${chats.lastMessageAt}, ${chats.createdAt})`));
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

  async deleteMessage(tx: Tx, messageId: string): Promise<void> {
    await tx.delete(messages).where(eq(messages.id, messageId));
  }

  async renameChat(tx: Tx, chatId: string, title: string): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({ title, updatedAt: sql`now()` })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo renombrar el chat");
    return chat;
  }

  async setArchived(tx: Tx, chatId: string, archived: boolean): Promise<ChatRow> {
    const [chat] = await tx
      .update(chats)
      .set({ archivedAt: archived ? sql`now()` : null, updatedAt: sql`now()` })
      .where(eq(chats.id, chatId))
      .returning();
    if (!chat) throw new Error("No se pudo archivar/desarchivar el chat");
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
