import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiUsageEvents, chats, creditLedger, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { ChatTitleService as ChatTitleServiceType } from "./chat-title.service.js";
import { TITLE_ATTEMPTS, assistantTurns, cleanTitle, transcriptForTitle } from "./chat-title.js";

// Título automático del chat (F10.8). Las funciones puras, y el servicio contra
// Postgres real con el modelo simulado: que escriba solo sobre el título de
// nacimiento, que cobre una vez, que no pise un renombrado y que se rinda
// después de la tercera respuesta.

const msg = (role: "user" | "assistant", text: string, extra: object[] = []): UIMessage => ({
  id: randomUUID(),
  role,
  parts: [{ type: "text", text }, ...(extra as UIMessage["parts"])],
});

describe("cleanTitle", () => {
  it("quita comillas, punto final y espacios de más", () => {
    expect(cleanTitle('"Promo de marquesitas para el martes."')).toBe(
      "Promo de marquesitas para el martes",
    );
    expect(cleanTitle("«Menú   de temporada»")).toBe("Menú de temporada");
    expect(cleanTitle("posts de la nutrióloga")).toBe("Posts de la nutrióloga");
    // Sin el signo de cierre, el de apertura tampoco se queda.
    expect(cleanTitle("¿Qué publicar el lunes?")).toBe("Qué publicar el lunes");
    expect(cleanTitle("¡Lanzamiento de temporada!")).toBe("Lanzamiento de temporada");
  });

  it("VACÍO (con o sin acento) o nada es que todavía no hay tema", () => {
    expect(cleanTitle("VACÍO")).toBeNull();
    expect(cleanTitle("vacio.")).toBeNull();
    expect(cleanTitle("  ")).toBeNull();
  });

  it("se queda con la primera línea y corta en palabra si es muy largo", () => {
    expect(cleanTitle("Calendario de octubre\nAquí va el porqué")).toBe("Calendario de octubre");
    const largo = cleanTitle(
      "Estrategia completa de contenido para la apertura de la nueva sucursal en Mérida norte",
    )!;
    expect(largo.length).toBeLessThanOrEqual(60);
    expect(largo.endsWith(" ")).toBe(false);
  });
});

describe("transcriptForTitle", () => {
  it("solo texto, sin tools, con quién dijo qué", () => {
    const conversation = [
      msg("user", "Hazme un post de marquesitas"),
      msg("assistant", "Listo, aquí va tu borrador.", [
        { type: "tool-crear_borrador_visual", state: "output-available", output: { secreto: 1 } },
      ]),
    ];
    const transcript = transcriptForTitle(conversation);
    expect(transcript).toBe(
      "Creator: Hazme un post de marquesitas\n\nPresencia: Listo, aquí va tu borrador.",
    );
    expect(assistantTurns(conversation)).toBe(1);
  });
});

const USAGE = {
  inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 8, text: 8, reasoning: undefined },
};

function modelo(texto: string, llamadas: { n: number }): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () => {
      llamadas.n += 1;
      return Promise.resolve({
        content: [{ type: "text", text: texto }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      });
    },
  });
}

describe("ChatTitleService", { timeout: 30_000 }, () => {
  let dbService: DbServiceType;
  let crear: (respuesta: string, llamadas: { n: number }) => ChatTitleServiceType;
  let userId: string;

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
    const { ChatRepository } = await import("./chat.repository.js");
    const { ChatTitleService } = await import("./chat-title.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());
    crear = (respuesta, llamadas) => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(respuesta, llamadas),
          id: "openai:mock-utility",
          provider: "openai",
          modelName: "mock-utility",
        }),
      };
      return new ChatTitleService(dbService, new ChatRepository(), ai as never, aiUsage, credits);
    };
    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Títulos", email: `titulos-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(eq(users.id, userId));
    await dbService.onModuleDestroy();
  });

  const nuevoChat = () =>
    dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      return chat!.id;
    });
  const chatDe = (chatId: string) =>
    dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.select().from(chats).where(eq(chats.id, chatId));
      return chat!;
    });
  const cobrosDe = (chatId: string) =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.reason, "chat_title"), eq(creditLedger.referenceId, chatId))),
    );
  const usosDe = (chatId: string) =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(aiUsageEvents)
        .where(and(eq(aiUsageEvents.chatId, chatId), eq(aiUsageEvents.taskKind, "chat_title"))),
    );
  const primerIntercambio = [
    msg("user", "Hazme un post de las marquesitas de mi puesto"),
    msg("assistant", "Listo, aquí va tu borrador."),
  ];

  it("titula tras la primera respuesta, lo cobra una vez y lo registra", async () => {
    const chatId = await nuevoChat();
    const llamadas = { n: 0 };
    await crear("Post de marquesitas del puesto.", llamadas).maybeTitle(
      userId,
      chatId,
      primerIntercambio,
    );
    const chat = await chatDe(chatId);
    expect(chat).toMatchObject({ title: "Post de marquesitas del puesto", titleSource: "auto" });
    const cobros = await cobrosDe(chatId);
    expect(cobros).toHaveLength(1);
    expect(cobros[0]!.delta).toBeLessThan(0);
    expect(await usosDe(chatId)).toHaveLength(1);

    // Ya titulado: el turno siguiente ni siquiera llama al modelo.
    await crear("Otro título", llamadas).maybeTitle(userId, chatId, [
      ...primerIntercambio,
      msg("user", "Ahora uno para Facebook"),
      msg("assistant", "Va."),
    ]);
    expect(llamadas.n).toBe(1);
    expect((await chatDe(chatId)).title).toBe("Post de marquesitas del puesto");
  });

  it("sin tema todavía (VACÍO) no escribe ni cobra, pero registra la llamada", async () => {
    const chatId = await nuevoChat();
    await crear("VACÍO", { n: 0 }).maybeTitle(userId, chatId, [
      msg("user", "hola"),
      msg("assistant", "¡Hola! ¿En qué te ayudo?"),
    ]);
    expect(await chatDe(chatId)).toMatchObject({ title: "Nuevo chat", titleSource: "default" });
    expect(await cobrosDe(chatId)).toHaveLength(0);
    expect(await usosDe(chatId)).toHaveLength(1);
  });

  it("nunca pisa un título que el creator escribió", async () => {
    const chatId = await nuevoChat();
    await dbService.runWithTenant(userId, async (tx) => {
      const { ChatRepository } = await import("./chat.repository.js");
      await new ChatRepository().renameChat(tx, chatId, "Mis ideas");
    });
    const llamadas = { n: 0 };
    await crear("Post de marquesitas", llamadas).maybeTitle(userId, chatId, primerIntercambio);
    expect(await chatDe(chatId)).toMatchObject({ title: "Mis ideas", titleSource: "user" });
    expect(llamadas.n).toBe(0);
    expect(await cobrosDe(chatId)).toHaveLength(0);
  });

  it("un chat creado con título es del creator: el automático no lo toca", async () => {
    const chatId = await dbService.runWithTenant(userId, async (tx) => {
      const { ChatRepository } = await import("./chat.repository.js");
      return (await new ChatRepository().createChat(tx, userId, "Campaña Hanal Pixán")).id;
    });
    const llamadas = { n: 0 };
    await crear("Post de marquesitas", llamadas).maybeTitle(userId, chatId, primerIntercambio);
    expect(await chatDe(chatId)).toMatchObject({
      title: "Campaña Hanal Pixán",
      titleSource: "user",
    });
    expect(llamadas.n).toBe(0);
  });

  it(`después de la respuesta ${String(TITLE_ATTEMPTS)} se rinde: no llama al modelo`, async () => {
    const chatId = await nuevoChat();
    const largo: UIMessage[] = [];
    for (let i = 0; i <= TITLE_ATTEMPTS; i++) {
      largo.push(msg("user", "hola"), msg("assistant", "¿Qué tal?"));
    }
    const llamadas = { n: 0 };
    await crear("Algo", llamadas).maybeTitle(userId, chatId, largo);
    expect(llamadas.n).toBe(0);
  });
});
