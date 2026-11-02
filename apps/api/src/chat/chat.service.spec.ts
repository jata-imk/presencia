import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import pg from "pg";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { UIMessage, UIMessageChunk, UIMessageStreamOptions } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsageEvents, chats, creditLedger, messages, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { ChatService as ChatServiceType } from "./chat.service.js";
import type { TurnSink, TurnStream } from "./turn-sink.js";

// El turno del chat sin HTTP (F11, PR2; addendum de ADR-006). Hasta aquí el
// turno no tenía pruebas propias: vivía amarrado al ServerResponse. Ahora
// habla con un `TurnSink`, y estas pruebas lo corren con uno de mentira (como
// lo hará Telegram) contra Postgres real y el modelo simulado: que guarde las
// dos partes del turno con su canal, que cobre una sola vez, que un corte se
// guarde como `stopped` sin cobro, que un error con usage se guarde `failed`
// y se cobre, y que avise a las pestañas abiertas solo al guardar la respuesta.

const USAGE = {
  inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 120, text: 120, reasoning: 0 },
};

const textParts = (
  text: string,
  finish: "stop" | "error" = "stop",
): LanguageModelV4StreamPart[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: finish, raw: finish }, usage: USAGE },
];

/** Un modelo que contesta de una. */
function modeloQueContesta(text: string, finish: "stop" | "error" = "stop") {
  return new MockLanguageModelV4({
    provider: "openai",
    modelId: "mock-chat",
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of textParts(text, finish)) controller.enqueue(part);
            controller.close();
          },
        }),
      }),
  });
}

/**
 * Un modelo que escribe una palabra y se queda pensando hasta que lo aborten,
 * como uno real a media respuesta.
 */
function modeloQueSeQueda() {
  return new MockLanguageModelV4({
    provider: "openai",
    modelId: "mock-chat",
    doStream: ({ abortSignal }) =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({ type: "text-delta", id: "t", delta: "Empiezo " });
            abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason));
          },
        }),
      }),
  });
}

/**
 * El sink de las pruebas: lee el turno como lo hará Telegram (con
 * `toUIMessageStream`, sin HTTP) y puede "irse" a media respuesta, como el
 * botón de detener.
 */
class SinkDePrueba implements TurnSink {
  gone = false;
  delivered = false;
  readonly chunks: UIMessageChunk[] = [];
  private listeners: (() => void)[] = [];
  /** Se va en cuanto llega el primer pedazo de texto. */
  constructor(private readonly irseAlPrimerTexto = false) {}

  onGone(listener: () => void): void {
    this.listeners.push(listener);
  }

  irse(): void {
    this.gone = true;
    for (const l of this.listeners) l();
  }

  async deliver(stream: TurnStream, options: UIMessageStreamOptions<UIMessage>): Promise<void> {
    for await (const chunk of stream.toUIMessageStream(options)) {
      this.chunks.push(chunk);
      if (this.irseAlPrimerTexto && chunk.type === "text-delta") this.irse();
    }
    if (!this.gone) this.delivered = true;
  }
}

const userMsg = (text: string): UIMessage => ({
  id: randomUUID(),
  role: "user",
  parts: [{ type: "text", text }],
});

let dbService: DbServiceType;
let crear: (model: MockLanguageModelV4) => ChatServiceType;
let modeloLlamado: () => number;
const usuarios: string[] = [];
let userId: string;
let chatId: string;

const filas = () =>
  dbService.runWithTenant(userId, (tx) =>
    tx.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt),
  );
const cobros = () =>
  dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "chat_message"))),
  );
const usos = () =>
  dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.chatId, chatId), eq(aiUsageEvents.taskKind, "chat"))),
  );

/** El turno guarda en onEnd, después de que streamChat ya volvió. */
async function hastaQueHaya(n: number) {
  await vi.waitFor(
    async () => {
      expect(await filas()).toHaveLength(n);
    },
    { timeout: 10_000, interval: 100 },
  );
}

describe("ChatService · el turno por un TurnSink", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");
    const { ChatRepository } = await import("./chat.repository.js");
    const { ChatService } = await import("./chat.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());

    crear = (model) => {
      let llamadas = 0;
      const contado = new MockLanguageModelV4({
        provider: model.provider,
        modelId: model.modelId,
        doStream: (options) => {
          llamadas++;
          return model.doStream(options);
        },
      });
      modeloLlamado = () => llamadas;
      const ai = {
        resolveForTask: () => ({
          model: contado,
          id: "openai:mock-chat",
          provider: "openai",
          modelName: "mock-chat",
          reasoning: undefined,
          fallbackFrom: null,
          attempts: [],
          chain: [],
        }),
      };
      // Lo que no es el turno en sí (título, compactación, memoria, adjuntos,
      // páginas leídas) va de mentira: tiene sus propias pruebas.
      const noop = () => Promise.resolve();
      return new ChatService(
        dbService,
        new ChatRepository(),
        ai as never,
        new CardsRepository(),
        { getDefaultForPrompt: () => Promise.resolve(null) } as never,
        aiUsage,
        credits,
        {} as never,
        { maybeTitle: noop } as never,
        { maybeEnqueue: noop } as never,
        { search: () => Promise.resolve([]), enqueueIndex: noop } as never,
        {
          resolveForMessage: (_tx: unknown, _chat: string, _id: string, m: UIMessage) =>
            Promise.resolve({ parts: m.parts, ids: [] }),
          linkToMessage: noop,
          forContext: () => Promise.resolve(new Map()),
          materialize: (m: UIMessage[]) => Promise.resolve(m),
        } as never,
        { enqueue: noop } as never,
        { forContext: () => Promise.resolve(new Map()) } as never,
        { enqueue: noop } as never,
        {} as never,
      );
    };
  }, 30_000);

  beforeEach(async () => {
    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Turno", email: `turno-${randomUUID()}@test.local`, emailVerified: true })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    usuarios.push(user.id);
    userId = user.id;
    chatId = await dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      return chat!.id;
    });
  });

  afterAll(async () => {
    // Un turno cortado registra su traza 3 s después (ABORTED_TRACE_GRACE_MS):
    // se espera antes de borrar al usuario, o choca con la FK.
    await new Promise((r) => setTimeout(r, 3_500));
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it(
    "un turno completo por un canal sin HTTP guarda las dos partes con su canal y cobra una vez",
    { timeout: 20_000 },
    async () => {
      const sink = new SinkDePrueba();
      await crear(modeloQueContesta("Va, aquí tienes tres ideas.")).streamChat(
        userId,
        chatId,
        userMsg("Dame ideas para mi café"),
        sink,
        { channel: "telegram", timezone: "America/Merida" },
      );
      await hastaQueHaya(2);

      const [user, reply] = await filas();
      expect(user).toMatchObject({ role: "user", channel: "telegram" });
      expect(reply).toMatchObject({ role: "assistant", channel: "telegram", status: "complete" });
      expect(JSON.stringify(reply!.parts)).toContain("tres ideas");
      // El sink recibió el stream del SDK, sin HTTP.
      expect(sink.chunks.some((c) => c.type === "text-delta")).toBe(true);
      // La respuesta se guarda en onEnd, antes de que el sink termine de leer.
      await vi.waitFor(() => expect(sink.delivered).toBe(true), { timeout: 5_000 });

      await vi.waitFor(async () => expect(await cobros()).toHaveLength(1), { timeout: 5_000 });
      const [cobro] = await cobros();
      expect(cobro!.delta).toBeLessThan(0);
      expect(cobro!.referenceId).toBe(reply!.id);
      await vi.waitFor(async () => expect(await usos()).toHaveLength(1), { timeout: 5_000 });
    },
  );

  it("sin canal, el turno es de la web", { timeout: 20_000 }, async () => {
    await crear(modeloQueContesta("Listo.")).streamChat(
      userId,
      chatId,
      userMsg("Hola"),
      new SinkDePrueba(),
    );
    await hastaQueHaya(2);
    expect((await filas()).map((f) => f.channel)).toEqual(["web", "web"]);
  });

  it(
    "si el que recibe ya se fue antes de empezar, no se toca nada ni se llama al modelo",
    { timeout: 20_000 },
    async () => {
      const sink = new SinkDePrueba();
      sink.gone = true;
      await crear(modeloQueContesta("No debería")).streamChat(
        userId,
        chatId,
        userMsg("Hola"),
        sink,
        { channel: "telegram" },
      );
      // Un respiro para que, si algo se fuera a guardar, se guarde.
      await new Promise((r) => setTimeout(r, 500));
      expect(await filas()).toHaveLength(0);
      expect(modeloLlamado()).toBe(0);
      expect(await cobros()).toHaveLength(0);
    },
  );

  it(
    "si se va a media respuesta (detener), se guarda lo escrito como stopped y no se cobra",
    { timeout: 20_000 },
    async () => {
      await crear(modeloQueSeQueda()).streamChat(
        userId,
        chatId,
        userMsg("Escríbeme algo largo"),
        new SinkDePrueba(true),
        { channel: "telegram" },
      );
      await hastaQueHaya(2);
      const [, reply] = await filas();
      expect(reply).toMatchObject({ role: "assistant", status: "stopped", channel: "telegram" });
      expect(JSON.stringify(reply!.parts)).toContain("Empiezo");
      // Un turno cortado no se cobra (ADR-012): se espera la gracia de la traza.
      await new Promise((r) => setTimeout(r, 500));
      expect(await cobros()).toHaveLength(0);
    },
  );

  it(
    "un error del modelo con usage legible se guarda como failed y se cobra",
    { timeout: 20_000 },
    async () => {
      await crear(modeloQueContesta("A medias", "error")).streamChat(
        userId,
        chatId,
        userMsg("Hola"),
        new SinkDePrueba(),
        { channel: "telegram" },
      );
      await hastaQueHaya(2);
      const [, reply] = await filas();
      expect(reply).toMatchObject({ status: "failed", channel: "telegram" });
      await vi.waitFor(async () => expect(await cobros()).toHaveLength(1), { timeout: 5_000 });
    },
  );

  it(
    "regenerar por un sink reemplaza la respuesta y la nueva sale por el canal pedido",
    { timeout: 20_000 },
    async () => {
      const msg = userMsg("Dame un título");
      await crear(modeloQueContesta("Primero")).streamChat(userId, chatId, msg, new SinkDePrueba());
      await hastaQueHaya(2);
      // El turno anterior tiene que soltar el chat antes de regenerar.
      await new Promise((r) => setTimeout(r, 200));

      await crear(modeloQueContesta("Segundo")).regenerateChat(
        userId,
        chatId,
        msg.id,
        new SinkDePrueba(),
        { channel: "telegram" },
      );
      await vi.waitFor(
        async () => {
          const rows = await filas();
          expect(rows).toHaveLength(2);
          expect(JSON.stringify(rows[1]!.parts)).toContain("Segundo");
        },
        { timeout: 10_000, interval: 100 },
      );
      const [user, reply] = await filas();
      // El mensaje del creator se queda como entró; la respuesta nueva es de Telegram.
      expect(user!.channel).toBe("web");
      expect(reply!.channel).toBe("telegram");
    },
  );

  it(
    "avisa a las pestañas abiertas (chat_changed) cuando se guarda la respuesta",
    { timeout: 20_000 },
    async () => {
      // Como el listener de realtime: una conexión aparte escuchando el canal.
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("Falta DATABASE_URL");
      const listener = new pg.Client({ connectionString: url });
      await listener.connect();
      const avisos: string[] = [];
      listener.on("notification", (n) => {
        if (n.payload) avisos.push(n.payload);
      });
      await listener.query("LISTEN chat_changed");
      try {
        await crear(modeloQueContesta("Listo")).streamChat(
          userId,
          chatId,
          userMsg("Hola"),
          new SinkDePrueba(),
          { channel: "telegram" },
        );
        await hastaQueHaya(2);
        await vi.waitFor(() => expect(avisos).toContain(`${userId}:${chatId}`), {
          timeout: 5_000,
        });
        // Uno solo por turno: al guardar la respuesta, no al guardar el mensaje
        // del creator (una pestaña lo vería como "sin respuesta" a medio turno).
        expect(avisos.filter((a) => a === `${userId}:${chatId}`)).toHaveLength(1);
      } finally {
        await listener.end();
      }
    },
  );
});
