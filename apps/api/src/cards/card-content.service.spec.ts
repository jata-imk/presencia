import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CARD_EDIT_SESSION_IDLE_MS, type CardContent } from "@presencia/shared";
import { cardVersions, chats, messages, publicationCards, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { CardContentService as CardContentServiceType } from "./card-content.service.js";

// Versiones del texto de una card (F10.5 PR3) contra Postgres real: la regla
// de la sesión de edición, que restaurar no borra nada, que una card
// programada no se edita, que la imagen no viaja con las versiones y que el
// RLS no deja ver ni tocar lo ajeno.

let dbService: DbServiceType;
let service: CardContentServiceType;
let userA: string;
let userB: string;
let chatA: string;

const VISUAL: CardContent = {
  archetype: "visual_first",
  caption: "Original del chat",
  hashtags: ["cafe"],
  imagePrompt: "una taza",
  assetIds: [],
};

async function createCard(
  content: CardContent = VISUAL,
  status: "draft" | "scheduled" = "draft",
): Promise<string> {
  return dbService.runWithTenant(userA, async (tx) => {
    const [row] = await tx
      .insert(publicationCards)
      .values({
        userId: userA,
        chatId: chatA,
        network: "instagram",
        archetype: content.archetype,
        content,
        status,
        scheduledAt: status === "scheduled" ? new Date(Date.now() + 3_600_000) : null,
      })
      .returning({ id: publicationCards.id });
    if (!row) throw new Error("No se pudo crear la card de prueba");
    return row.id;
  });
}

describe("CardContentService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("./cards.repository.js");
    const { CardVersionsRepository } = await import("./card-versions.repository.js");
    const { CardContentService } = await import("./card-content.service.js");
    dbService = new DbService();
    service = new CardContentService(
      dbService,
      new CardsRepository(),
      new CardVersionsRepository(),
    );

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Versiones A", email: `versiones-a-${randomUUID()}@test.local` },
        { name: "Versiones B", email: `versiones-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      if (!chat) throw new Error("No se pudo crear el chat de prueba");
      return chat.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  });

  it("una card sin cambios tiene una sola versión: la original", async () => {
    const cardId = await createCard();
    const list = await service.list(userA, cardId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      n: 1,
      source: "chat",
      content: { caption: "Original del chat" },
    });
    expect(list[0]!.content).not.toHaveProperty("assetIds");
  });

  it("la misma sesión de edición es una versión; otra sesión, otra", async () => {
    const cardId = await createCard();
    const s1 = randomUUID();
    const a = await service.edit(userA, cardId, { caption: "Hola" }, s1);
    const b = await service.edit(userA, cardId, { caption: "Hola mundo" }, s1);
    expect(a.version.n).toBe(2);
    expect(b.version.n).toBe(2);
    expect(b.card.content).toMatchObject({ caption: "Hola mundo", imagePrompt: "una taza" });

    const c = await service.edit(userA, cardId, { caption: "Otra sesión" }, randomUUID());
    expect(c.version.n).toBe(3);

    const list = await service.list(userA, cardId);
    expect(list.map((v) => [v.n, v.source, (v.content as { caption: string }).caption])).toEqual([
      [1, "chat", "Original del chat"],
      [2, "manual", "Hola mundo"],
      [3, "manual", "Otra sesión"],
    ]);
  });

  it("la misma sesión después de 10 minutos sin guardar abre una versión nueva", async () => {
    const cardId = await createCard();
    const s1 = randomUUID();
    await service.edit(userA, cardId, { caption: "Primero" }, s1);
    const past = new Date(Date.now() - CARD_EDIT_SESSION_IDLE_MS - 1000);
    await dbService.runWithTenant(userA, (tx) =>
      tx.update(cardVersions).set({ updatedAt: past }).where(eq(cardVersions.cardId, cardId)),
    );
    const later = await service.edit(userA, cardId, { caption: "Después" }, s1);
    expect(later.version.n).toBe(3);
  });

  it("guardar lo mismo que ya hay no crea versiones", async () => {
    const cardId = await createCard();
    const result = await service.edit(
      userA,
      cardId,
      { caption: "Original del chat" },
      randomUUID(),
    );
    expect(result.version.n).toBe(1);
    const rows = await dbService.runWithTenant(userA, (tx) =>
      tx.select().from(cardVersions).where(eq(cardVersions.cardId, cardId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("restaurar crea una versión nueva y conserva la imagen elegida", async () => {
    const cardId = await createCard();
    await service.edit(userA, cardId, { caption: "Editada" }, randomUUID());
    // La imagen cambia por su propio camino (F10): restaurar texto no la toca.
    const assetId = randomUUID();
    await dbService.runWithTenant(userA, (tx) =>
      tx
        .update(publicationCards)
        .set({
          content: sql`jsonb_set(${publicationCards.content}, '{assetIds}', ${JSON.stringify([assetId])}::jsonb)`,
        })
        .where(eq(publicationCards.id, cardId)),
    );

    const restored = await service.restore(userA, cardId, 1);
    expect(restored.version).toMatchObject({ n: 3, source: "restore", restoredFrom: 1 });
    expect(restored.card.content).toMatchObject({
      caption: "Original del chat",
      assetIds: [assetId],
    });
    expect((await service.list(userA, cardId)).map((v) => v.n)).toEqual([1, 2, 3]);
  });

  it("F10.6: editar y restaurar el texto no toca los slides del carrusel", async () => {
    const a1 = randomUUID();
    const slides = [
      { id: randomUUID(), imagePrompt: "portada", assetId: a1 },
      { id: randomUUID(), imagePrompt: "segundo" },
    ];
    const cardId = await createCard({ ...VISUAL, slides, assetIds: [a1] });
    await service.edit(userA, cardId, { caption: "Editada" }, randomUUID());
    const restored = await service.restore(userA, cardId, 1);
    expect(restored.card.content).toMatchObject({
      caption: "Original del chat",
      slides,
      assetIds: [a1],
    });
    // La versión guarda el texto, no los slides.
    const [v1] = await service.list(userA, cardId);
    expect(v1!.content).not.toHaveProperty("slides");
    expect(v1!.content).not.toHaveProperty("assetIds");
  });

  it("descarta campos que no son del arquetipo", async () => {
    const cardId = await createCard();
    const result = await service.edit(
      userA,
      cardId,
      { body: "no es de un post visual" },
      randomUUID(),
    );
    expect(result.card.content).not.toHaveProperty("body");
    expect(result.version.n).toBe(1);
  });

  it("no edita ni restaura una card programada", async () => {
    const cardId = await createCard(VISUAL, "scheduled");
    await expect(service.edit(userA, cardId, { caption: "x" }, randomUUID())).rejects.toThrow(
      /programada/,
    );
    await expect(service.restore(userA, cardId, 1)).rejects.toThrow(/programada/);
  });

  it("RLS: otro usuario no ve ni edita las versiones", async () => {
    const cardId = await createCard();
    await service.edit(userA, cardId, { caption: "Mía" }, randomUUID());
    await expect(service.list(userB, cardId)).rejects.toThrow(/No encontramos/);
    await expect(service.edit(userB, cardId, { caption: "ajena" }, randomUUID())).rejects.toThrow(
      /No encontramos/,
    );
    const visibles = await dbService.runWithTenant(userB, (tx) =>
      tx.select().from(cardVersions).where(eq(cardVersions.cardId, cardId)),
    );
    expect(visibles).toHaveLength(0);
  });

  it("borrar la card borra sus versiones", async () => {
    const cardId = await createCard();
    await service.edit(userA, cardId, { caption: "Se va" }, randomUUID());
    await dbService.runWithTenant(userA, (tx) =>
      tx.delete(publicationCards).where(eq(publicationCards.id, cardId)),
    );
    const rows = await dbService.runWithTenant(userA, (tx) =>
      tx.select().from(cardVersions).where(eq(cardVersions.cardId, cardId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("regenerar: sabe si la respuesta tiene cards que ya salieron a la red", async () => {
    const { CardsRepository } = await import("./cards.repository.js");
    const repo = new CardsRepository();
    const messageId = await dbService.runWithTenant(userA, async (tx) => {
      const [m] = await tx
        .insert(messages)
        .values({ chatId: chatA, userId: userA, role: "assistant", parts: [] })
        .returning({ id: messages.id });
      return m!.id;
    });
    const draft = await createCard();
    await dbService.runWithTenant(userA, (tx) =>
      tx.update(publicationCards).set({ messageId }).where(eq(publicationCards.id, draft)),
    );
    expect(await dbService.runWithTenant(userA, (tx) => repo.hasSentCards(tx, messageId))).toBe(
      false,
    );

    const scheduled = await createCard(VISUAL, "scheduled");
    await dbService.runWithTenant(userA, (tx) =>
      tx.update(publicationCards).set({ messageId }).where(eq(publicationCards.id, scheduled)),
    );
    expect(await dbService.runWithTenant(userA, (tx) => repo.hasSentCards(tx, messageId))).toBe(
      true,
    );
  });
});
