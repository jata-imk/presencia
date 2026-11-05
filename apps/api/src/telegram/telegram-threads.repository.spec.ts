import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chats, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import { TelegramThreadsRepository } from "./telegram-threads.repository.js";

// La tabla de temas (F11 PR4, migración 0060) contra Postgres real y como
// presencia_app: un tema es un chat (también la conversación sin tema, por el
// NULLS NOT DISTINCT), borrar el chat suelta su tema, y un creator no ve los
// temas de otro (RLS).

let db: DbServiceType;
const repo = new TelegramThreadsRepository();
const usuarios: string[] = [];

async function usuarioConChat(): Promise<{ userId: string; chatId: () => Promise<string> }> {
  const [user] = await db.db
    .insert(users)
    .values({ name: "Temas", email: `temas-${randomUUID()}@test.local`, emailVerified: true })
    .returning({ id: users.id });
  if (!user) throw new Error("sin usuario");
  usuarios.push(user.id);
  const chatId = async () => {
    // chats tiene RLS: con el tenant.
    const [chat] = await db.runWithTenant(user.id, (tx) =>
      tx.insert(chats).values({ userId: user.id }).returning({ id: chats.id }),
    );
    return chat!.id;
  };
  return { userId: user.id, chatId };
}

const tg = () => Math.floor(Math.random() * 1e12);

describe("TelegramThreadsRepository", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    db = new DbService();
  }, 30_000);

  afterAll(async () => {
    if (usuarios.length > 0) await db.db.delete(users).where(inArray(users.id, usuarios));
    await db.onModuleDestroy();
  }, 30_000);

  it("cada tema y la conversación sin tema son un chat cada uno", async () => {
    const { userId, chatId } = await usuarioConChat();
    const telegramChatId = tg();
    const [a, b, c] = [await chatId(), await chatId(), await chatId()];
    await db.runWithTenant(userId, async (tx) => {
      const tema = { telegramChatId, threadId: 7 };
      const sinTema = { telegramChatId, threadId: null };
      expect(
        await repo.insert(tx, { userId, chatId: a, place: tema, renameTopic: true }),
      ).toBeDefined();
      expect(
        await repo.insert(tx, { userId, chatId: b, place: sinTema, renameTopic: true }),
      ).toBeDefined();
      expect((await repo.findByPlace(tx, tema))?.chatId).toBe(a);
      expect((await repo.findByPlace(tx, sinTema))?.chatId).toBe(b);
      // Otra fila sin tema para el mismo chat de Telegram choca (NULLS NOT DISTINCT).
      expect(
        await repo.insert(tx, { userId, chatId: c, place: sinTema, renameTopic: true }),
      ).toBeUndefined();
      // /new la suelta, y entonces sí.
      expect(await repo.releaseUnthreaded(tx, telegramChatId)).toBe(true);
      expect(await repo.findByPlace(tx, sinTema)).toBeUndefined();
      expect(
        await repo.insert(tx, { userId, chatId: c, place: sinTema, renameTopic: true }),
      ).toBeDefined();
      expect(await repo.releaseUnthreaded(tx, tg())).toBe(false);
    });
  });

  it("borrar el chat en la web suelta su tema", async () => {
    const { userId, chatId } = await usuarioConChat();
    const place = { telegramChatId: tg(), threadId: 3 };
    const id = await chatId();
    await db.runWithTenant(userId, (tx) =>
      repo.insert(tx, { userId, chatId: id, place, renameTopic: true }),
    );
    await db.runWithTenant(userId, (tx) => tx.delete(chats).where(eq(chats.id, id)));
    expect(await db.runWithTenant(userId, (tx) => repo.findByPlace(tx, place))).toBeUndefined();
  });

  it("deleteByChat suelta el tema del chat; el de otro creator, no (F11 PR7b)", async () => {
    const yo = await usuarioConChat();
    const otro = await usuarioConChat();
    const place = { telegramChatId: tg(), threadId: 4 };
    const id = await yo.chatId();
    await db.runWithTenant(yo.userId, (tx) =>
      repo.insert(tx, { userId: yo.userId, chatId: id, place, renameTopic: true }),
    );
    // Otro creator no puede soltarlo (RLS).
    await db.runWithTenant(otro.userId, (tx) => repo.deleteByChat(tx, id));
    expect(await db.runWithTenant(yo.userId, (tx) => repo.findByChat(tx, id))).toBeDefined();
    await db.runWithTenant(yo.userId, (tx) => repo.deleteByChat(tx, id));
    expect(await db.runWithTenant(yo.userId, (tx) => repo.findByChat(tx, id))).toBeUndefined();
  });

  it("un creator no ve los temas de otro", async () => {
    const yo = await usuarioConChat();
    const otro = await usuarioConChat();
    const place = { telegramChatId: tg(), threadId: 1 };
    const id = await yo.chatId();
    await db.runWithTenant(yo.userId, (tx) =>
      repo.insert(tx, { userId: yo.userId, chatId: id, place, renameTopic: true }),
    );
    expect(
      await db.runWithTenant(otro.userId, (tx) => repo.findByPlace(tx, place)),
    ).toBeUndefined();
    expect(await db.runWithTenant(otro.userId, (tx) => repo.findByChat(tx, id))).toBeUndefined();
    // Ni puede escribir una fila a nombre de otro.
    await expect(
      db.runWithTenant(otro.userId, (tx) =>
        repo.insert(tx, {
          userId: yo.userId,
          chatId: id,
          place: { telegramChatId: tg(), threadId: 2 },
          renameTopic: true,
        }),
      ),
    ).rejects.toThrow();
  });
});
