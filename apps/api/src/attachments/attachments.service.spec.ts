import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachmentContentUrl } from "@presencia/shared";
import { chats, messageAttachments, users } from "../db/schema.js";
import { LocalAssetStorage } from "../assets/asset-storage.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { AttachmentsService as AttachmentsServiceType } from "./attachments.service.js";

// Los adjuntos del chat (F10.9) contra Postgres real y el storage de disco:
// que la fila y los bytes nazcan juntos, que lo ajeno no exista, y que el
// barrido y el borrado del chat se lleven los bytes.

let dbService: DbServiceType;
let service: AttachmentsServiceType;
let storageDir: string;
let userA: string;
let userB: string;
let chatA: string;

const fileOf = (key: string) => path.join(storageDir, key);

describe("AttachmentsService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AttachmentsRepository } = await import("./attachments.repository.js");
    const { AttachmentsService } = await import("./attachments.service.js");

    storageDir = await mkdtemp(path.join(tmpdir(), "presencia-adjuntos-"));
    dbService = new DbService();
    service = new AttachmentsService(
      dbService,
      new AttachmentsRepository(),
      new LocalAssetStorage(storageDir),
    );

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Adjuntos A", email: `adjuntos-a-${randomUUID()}@test.local` },
        { name: "Adjuntos B", email: `adjuntos-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      return chat!.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
    await rm(storageDir, { recursive: true, force: true });
  });

  const rowOf = (id: string) =>
    dbService.runWithTenant(userA, async (tx) => {
      const [row] = await tx.select().from(messageAttachments).where(eq(messageAttachments.id, id));
      return row;
    });

  it("sube una foto grande: fila + archivo + variante del modelo", async () => {
    const foto = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#c85028" },
    })
      .jpeg()
      .toBuffer();

    const dto = await service.upload({
      userId: userA,
      chatId: chatA,
      data: new Uint8Array(foto),
      filename: "tacos.jpg",
    });

    expect(dto).toMatchObject({
      kind: "image",
      filename: "tacos.jpg",
      mediaType: "image/jpeg",
      width: 2048,
      url: attachmentContentUrl(dto.id),
    });
    const row = await rowOf(dto.id);
    expect(row).toMatchObject({ chatId: chatA, messageId: null, userId: userA });
    expect(row?.storageKey).toBe(`${userA}/adjuntos/${dto.id}.jpg`);
    expect(existsSync(fileOf(row!.storageKey))).toBe(true);
    expect(existsSync(fileOf(row!.modelStorageKey!))).toBe(true);
  });

  it("sin chat (pantalla de chat nuevo) también sube; con un chat ajeno, no", async () => {
    const md = new TextEncoder().encode("# Ideas\n- Promo de martes");
    const sinChat = await service.upload({
      userId: userA,
      chatId: null,
      data: md,
      filename: "a.md",
    });
    expect((await rowOf(sinChat.id))?.chatId).toBeNull();

    await expect(
      service.upload({ userId: userB, chatId: chatA, data: md, filename: "a.md" }),
    ).rejects.toThrow(/Ese chat no existe/);
  });

  it("un tipo que no se adjunta es 415", async () => {
    await expect(
      service.upload({
        userId: userA,
        chatId: chatA,
        data: new Uint8Array([0x50, 0x4b, 3, 4]),
        filename: "x.docx",
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("lo ajeno no se entrega", async () => {
    const md = new TextEncoder().encode("privado");
    const dto = await service.upload({ userId: userA, chatId: chatA, data: md, filename: "p.txt" });
    await expect(service.deliver(userB, dto.id)).resolves.toBeNull();
    const propio = await service.deliver(userA, dto.id);
    expect(propio).toMatchObject({ mimeType: "text/plain", filename: "p.txt" });
  });

  it("un adjunto ya ligado a un mensaje no se puede mandar en otro chat", async () => {
    const { messages } = await import("../db/schema.js");
    const dto = await service.upload({
      userId: userA,
      chatId: null,
      data: new TextEncoder().encode("una sola vez"),
      filename: "u.txt",
    });
    const otroChat = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      return chat!.id;
    });
    const mensaje = () => ({
      id: randomUUID(),
      role: "user" as const,
      parts: [{ type: "file" as const, mediaType: "text/plain", url: dto.url }],
    });
    // Primer envío: se liga a chatA.
    await dbService.runWithTenant(userA, async (tx) => {
      const message = mensaje();
      const { ids } = await service.resolveForMessage(tx, chatA, message.id, message);
      await tx
        .insert(messages)
        .values({ id: message.id, chatId: chatA, userId: userA, role: "user", parts: [] });
      await service.linkToMessage(tx, ids, chatA, message.id);
    });
    // Segundo envío del mismo adjunto, en otro chat: ya no está disponible.
    const segundo = mensaje();
    await expect(
      dbService.runWithTenant(userA, (tx) =>
        service.resolveForMessage(tx, otroChat, segundo.id, segundo),
      ),
    ).rejects.toThrow(/ya no está disponible/);
  });

  it("el barrido borra los que llevan más de un día sin enviarse, con sus bytes", async () => {
    const data = new TextEncoder().encode("viejo");
    const viejo = await service.upload({ userId: userA, chatId: chatA, data, filename: "v.txt" });
    const nuevo = await service.upload({ userId: userA, chatId: chatA, data, filename: "n.txt" });
    await dbService.runWithTenant(userA, (tx) =>
      tx
        .update(messageAttachments)
        .set({ createdAt: sql`now() - interval '25 hours'` })
        .where(eq(messageAttachments.id, viejo.id)),
    );
    const viejoKey = (await rowOf(viejo.id))!.storageKey;

    await service.cleanupUnsent();

    expect(await rowOf(viejo.id)).toBeUndefined();
    expect(existsSync(fileOf(viejoKey))).toBe(false);
    expect(await rowOf(nuevo.id)).toBeDefined();
  });

  it("al borrar el chat, las filas se van por el cascade y los bytes con deleteObjects", async () => {
    const chatId = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      return chat!.id;
    });
    const dto = await service.upload({
      userId: userA,
      chatId,
      data: new TextEncoder().encode("se va con el chat"),
      filename: "c.txt",
    });
    const key = (await rowOf(dto.id))!.storageKey;

    const keys = await dbService.runWithTenant(userA, async (tx) => {
      const found = await service.keysByChat(tx, chatId);
      await tx.delete(chats).where(eq(chats.id, chatId));
      return found;
    });
    await service.deleteObjects(keys);

    expect(await rowOf(dto.id)).toBeUndefined();
    expect(existsSync(fileOf(key))).toBe(false);
  });
});
