import { Injectable } from "@nestjs/common";
import { asc, desc, eq, sql } from "drizzle-orm";
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

  listChats(tx: Tx): Promise<ChatRow[]> {
    return tx
      .select()
      .from(chats)
      .orderBy(desc(sql`coalesce(${chats.lastMessageAt}, ${chats.createdAt})`));
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
}
