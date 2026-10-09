import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { MockEmbeddingModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiUsageEvents, chats, memoryChunks, messages, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { MemoryService as MemoryServiceType } from "./memory.service.js";
import { EMBEDDING_DIMENSIONS } from "../ai/provider-registry.js";
import { embeddingOptions, exchangeText } from "./memory.js";

// Memoria entre chats (F10.8) contra Postgres real con pgvector, con un modelo
// de embeddings simulado: vectores por tema, así "marquesitas" queda cerca de
// "marquesitas" y lejos de todo lo demás.

describe("lo puro de la memoria", () => {
  it("el fragmento es el intercambio: quién dijo qué", () => {
    const texto = exchangeText(
      { id: "u", role: "user", parts: [{ type: "text", text: "Mi promo es 2x1 los martes" }] },
      { id: "a", role: "assistant", parts: [{ type: "text", text: "Te armo el post." }] },
    );
    expect(texto).toBe("Creator: Mi promo es 2x1 los martes\n\nPresencia: Te armo el post.");
  });

  it("Google distingue documento de consulta; las dimensiones son siempre las mismas", () => {
    expect(embeddingOptions("google", "document")).toEqual({
      google: { outputDimensionality: 1536, taskType: "RETRIEVAL_DOCUMENT" },
    });
    expect(embeddingOptions("google", "query").google?.taskType).toBe("RETRIEVAL_QUERY");
    expect(embeddingOptions("openai", "query")).toEqual({ openai: { dimensions: 1536 } });
  });
});

const TEMAS = ["marquesita", "hashtag", "lasaña"];

/** Un vector por tema: 1 en la dimensión del tema, más un fondo común chico. */
function vectorDe(texto: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  TEMAS.forEach((tema, i) => {
    if (texto.toLowerCase().includes(tema)) v[i] = 1;
  });
  v[EMBEDDING_DIMENSIONS - 1] = 0.3;
  return v;
}

const modelo = new MockEmbeddingModelV4({
  doEmbed: ({ values }) =>
    Promise.resolve({ embeddings: values.map((v) => vectorDe(String(v))), warnings: [] }),
});

describe("MemoryService", { timeout: 60_000 }, () => {
  let dbService: DbServiceType;
  let service: MemoryServiceType;
  let userId: string;
  let otherUser: string;

  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { ChatRepository } = await import("./chat.repository.js");
    const { MemoryService } = await import("./memory.service.js");
    dbService = new DbService();
    service = new MemoryService(
      dbService,
      new ChatRepository(),
      new AiUsageService(dbService, new AiUsageRepository()),
      {} as never,
    );
    // El modelo real se resuelve por env; aquí, el simulado.
    Object.assign(service, { resolve: () => modelo });
    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Memoria", email: `memoria-${randomUUID()}@test.local` },
        { name: "Ajeno", email: `ajeno-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    userId = a!.id;
    otherUser = b!.id;
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(eq(users.id, userId));
    await dbService.db.delete(users).where(eq(users.id, otherUser));
    await dbService.onModuleDestroy();
  });

  /** Un chat con un intercambio; devuelve el chat y la respuesta. */
  async function chatCon(owner: string, pregunta: string, respuesta: string, base = Date.now()) {
    return dbService.runWithTenant(owner, async (tx) => {
      const [chat] = await tx
        .insert(chats)
        .values({ userId: owner, title: pregunta.slice(0, 30) })
        .returning({ id: chats.id });
      const [, reply] = await tx
        .insert(messages)
        .values([
          {
            chatId: chat!.id,
            userId: owner,
            role: "user" as const,
            parts: [{ type: "text", text: pregunta }],
            createdAt: new Date(base),
          },
          {
            chatId: chat!.id,
            userId: owner,
            role: "assistant" as const,
            parts: [{ type: "text", text: respuesta }],
            createdAt: new Date(base + 1_000),
          },
        ])
        .returning({ id: messages.id });
      return { chatId: chat!.id, messageId: reply!.id };
    });
  }

  it("indexa un intercambio una sola vez y registra el uso", async () => {
    const { chatId, messageId } = await chatCon(
      userId,
      "Vendo marquesitas en Santa Ana",
      "Te armo un post de marquesitas.",
    );
    await service.index({ userId, chatId, messageId });
    await service.index({ userId, chatId, messageId }); // pg-boss lo entregó dos veces
    const filas = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(memoryChunks).where(eq(memoryChunks.messageId, messageId)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]!.content).toContain("Creator: Vendo marquesitas");
    const usos = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(aiUsageEvents).where(eq(aiUsageEvents.chatId, chatId)),
    );
    expect(usos.map((u) => u.taskKind)).toEqual(["memory_index"]);
  });

  it("una respuesta que ya no existe (se regeneró) no se indexa ni se cobra", async () => {
    const { chatId, messageId } = await chatCon(userId, "Más marquesitas de nutella", "Va.");
    await dbService.runWithTenant(userId, (tx) =>
      tx.delete(messages).where(eq(messages.id, messageId)),
    );
    await service.index({ userId, chatId, messageId });
    const usos = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(aiUsageEvents).where(eq(aiUsageEvents.chatId, chatId)),
    );
    expect(usos).toEqual([]);
  });

  it("busca en los OTROS chats, por significado, y descarta lo que no se parece", async () => {
    const haceTresMeses = Date.now() - 90 * 24 * 3600 * 1000;
    const viejo = await chatCon(
      userId,
      "¿Qué hashtags uso?",
      "Usa #SantaAnaMerida.",
      haceTresMeses,
    );
    await service.index({ userId, ...viejo });
    const actual = await chatCon(userId, "Hola de nuevo", "¿En qué te ayudo?");

    const hashtags = await service.search(userId, actual.chatId, "los hashtag que me dijiste");
    expect(hashtags.resultados).toHaveLength(1);
    expect(hashtags.resultados[0]!.fragmento).toContain("#SantaAnaMerida");
    // La fecha es la de la conversación, no la de cuando se indexó.
    expect(hashtags.resultados[0]!.fecha).toBe(new Date(haceTresMeses + 1_000).toISOString());

    // Nada que ver con lo guardado: la similitud no pasa el umbral.
    const nada = await service.search(userId, actual.chatId, "receta de lasaña");
    expect(nada.resultados).toEqual([]);

    // Desde el mismo chat donde pasó, no se "recuerda" a sí mismo.
    const mismo = await service.search(userId, viejo.chatId, "los hashtag que me dijiste");
    expect(mismo.resultados).toEqual([]);
  });

  it("otro usuario nunca encuentra la memoria ajena (RLS)", async () => {
    const mio = await chatCon(userId, "Mis marquesitas de cajeta", "Anotado.");
    await service.index({ userId, ...mio });
    const suyo = await chatCon(otherUser, "Hola", "¿Qué tal?");
    const r = await service.search(otherUser, suyo.chatId, "marquesitas de cajeta");
    expect(r.resultados).toEqual([]);
  });

  it("solo busca entre los fragmentos del modelo vigente", async () => {
    const viejo = await chatCon(userId, "Más marquesitas", "Va.");
    await dbService.runWithTenant(userId, (tx) =>
      tx.insert(memoryChunks).values({
        userId,
        chatId: viejo.chatId,
        messageId: viejo.messageId,
        content: "Creator: marquesitas de otro modelo",
        embedding: vectorDe("marquesita"),
        model: "openai:un-modelo-viejo",
      }),
    );
    const actual = await chatCon(userId, "Hola", "Hola.");
    const r = await service.search(userId, actual.chatId, "marquesitas");
    expect(r.resultados.some((h) => h.fragmento.includes("otro modelo"))).toBe(false);
  });
});
