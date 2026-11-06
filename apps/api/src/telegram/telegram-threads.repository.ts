import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { telegramThreads } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Qué chat de Presencia es cada tema de Telegram (F11 PR4, ADR-030). Siempre
// con el tenant (`runWithTenant`): el bot ya sabe de quién es el update
// (channel_links) antes de buscar el tema.

export type TelegramThreadRow = typeof telegramThreads.$inferSelect;

/** Dónde se escribió: el chat privado con el bot y el tema (null = sin tema). */
export interface TelegramPlace {
  telegramChatId: number;
  threadId: number | null;
}

@Injectable()
export class TelegramThreadsRepository {
  async findByPlace(tx: Tx, place: TelegramPlace): Promise<TelegramThreadRow | undefined> {
    const [row] = await tx
      .select()
      .from(telegramThreads)
      .where(
        and(
          eq(telegramThreads.telegramChatId, place.telegramChatId),
          place.threadId === null
            ? isNull(telegramThreads.messageThreadId)
            : eq(telegramThreads.messageThreadId, place.threadId),
        ),
      );
    return row;
  }

  async findByChat(tx: Tx, chatId: string): Promise<TelegramThreadRow | undefined> {
    const [row] = await tx.select().from(telegramThreads).where(eq(telegramThreads.chatId, chatId));
    return row;
  }

  /** Liga el tema al chat. `undefined` si ese tema ya tenía chat (lo ganó otro mensaje). */
  async insert(
    tx: Tx,
    values: { userId: string; chatId: string; place: TelegramPlace; renameTopic: boolean },
  ): Promise<TelegramThreadRow | undefined> {
    const [row] = await tx
      .insert(telegramThreads)
      .values({
        userId: values.userId,
        chatId: values.chatId,
        telegramChatId: values.place.telegramChatId,
        messageThreadId: values.place.threadId,
        renameTopic: values.renameTopic,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  /**
   * Suelta el tema del chat (F11 PR7b, "Continuar en Telegram"): el creator lo
   * borró en Telegram, o el chat era de otro Telegram que ya no está
   * conectado. El chat se queda; su siguiente tema será otro.
   */
  async deleteByChat(tx: Tx, chatId: string): Promise<void> {
    await tx.delete(telegramThreads).where(eq(telegramThreads.chatId, chatId));
  }

  /**
   * `/new` en un cliente sin temas: suelta el chat de la conversación sin
   * tema, y el siguiente mensaje empieza otro. El chat se queda (es historia).
   */
  async releaseUnthreaded(tx: Tx, telegramChatId: number): Promise<boolean> {
    const rows = await tx
      .delete(telegramThreads)
      .where(
        and(
          eq(telegramThreads.telegramChatId, telegramChatId),
          isNull(telegramThreads.messageThreadId),
        ),
      )
      .returning({ id: telegramThreads.id });
    return rows.length > 0;
  }
}
