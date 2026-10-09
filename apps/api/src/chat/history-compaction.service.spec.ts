import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CardContent } from "@presencia/shared";
import {
  aiUsageEvents,
  chatSummaries,
  chats,
  creditLedger,
  messages,
  users,
} from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { HistoryCompactionService as HistoryCompactionServiceType } from "./history-compaction.service.js";
import {
  boundedTramo,
  contextTokensOf,
  mergeCards,
  transcriptForSummary,
} from "./history-compaction.js";

// Compactación del historial (F10.8) contra Postgres real, con el modelo
// simulado: que resuma el tramo viejo dejando lo reciente, que la lista de
// cards salga sin LLM, que cobre una vez por compactación, que un segundo job
// no haga nada y que la siguiente integre el resumen anterior.

const VISUAL: CardContent = {
  archetype: "visual_first",
  caption: "Marquesitas 2×1 los martes en el parque de Santa Ana.",
  hashtags: ["merida"],
  imagePrompt: "una marquesita",
  assetIds: [],
};

describe("lo puro de la compactación", () => {
  it("el contexto de un turno es el paso más grande, no la suma", () => {
    expect(
      contextTokensOf([{ usage: { inputTokens: 30_000 } }, { usage: { inputTokens: 31_000 } }]),
    ).toBe(31_000);
    expect(contextTokensOf([])).toBe(0);
  });

  it("un tramo enorme se resume por partes, sin partir un turno", () => {
    const largo: UIMessage[] = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: "x".repeat(3_000) }],
    }));
    const parte = boundedTramo(largo, 30_000);
    expect(parte.length).toBeGreaterThan(2);
    expect(parte.length).toBeLessThan(largo.length);
    expect(parte.at(-1)!.role).toBe("assistant");
    expect(boundedTramo(largo.slice(0, 6))).toHaveLength(6);
  });

  it("las cards se juntan sin duplicar; la más reciente gana", () => {
    const vieja = {
      cardId: "c1",
      network: "instagram" as const,
      status: "draft" as const,
      resumen: "a",
    };
    const nueva = { ...vieja, status: "scheduled" as const, resumen: "b" };
    expect(mergeCards([vieja], [nueva])).toEqual([nueva]);
  });

  it("el transcript lleva quién dijo qué y las cards como una línea, no el JSON", () => {
    const t = transcriptForSummary([
      { id: "1", role: "user", parts: [{ type: "text", text: "Hazme un post" }] },
      {
        id: "2",
        role: "assistant",
        parts: [
          { type: "text", text: "Listo." },
          {
            type: "tool-crear_borrador_visual",
            toolCallId: "t",
            state: "output-available",
            input: {},
            output: { cardId: "c1", network: "instagram", status: "draft", content: VISUAL },
          } as never,
        ],
      },
    ]);
    expect(t).toContain("Creator: Hazme un post");
    expect(t).toContain("Presencia: Listo.");
    expect(t).toContain("publicación de instagram");
    expect(t).not.toContain("imagePrompt");
  });
});

const USAGE = {
  inputTokens: { total: 4000, noCache: 4000, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 300, text: 300, reasoning: undefined },
};

function modelo(texto: string, prompts: string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: "text", text: texto }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      });
    },
  });
}

describe("HistoryCompactionService", { timeout: 60_000 }, () => {
  let dbService: DbServiceType;
  let crear: (respuesta: string, prompts: string[]) => HistoryCompactionServiceType;
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
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    const { ChatRepository } = await import("./chat.repository.js");
    const { HistoryCompactionService } = await import("./history-compaction.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());
    crear = (respuesta, prompts) => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(respuesta, prompts),
          id: "openai:mock-utility",
          provider: "openai",
          modelName: "mock-utility",
        }),
      };
      return new HistoryCompactionService(
        dbService,
        new ChatRepository(),
        ai as never,
        aiUsage,
        credits,
        { enqueue: () => Promise.resolve(true) } as never,
      );
    };
    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Compacta", email: `compacta-${randomUUID()}@test.local` },
        { name: "Otro", email: `otro-${randomUUID()}@test.local` },
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

  /**
   * Relleno para que cada mensaje pese ~1.1k tokens: lo reciente se conserva
   * por tokens (KEEP_RECENT_TOKENS), y con mensajes diminutos cabría el chat
   * entero.
   */
  const RELLENO = ` ${"x".repeat(4_400)}`;

  /** Un chat con n intercambios, con una card en el primero; mensajes a 1 s de distancia. */
  async function chatLargo(n: number): Promise<{ chatId: string; ids: string[] }> {
    return dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      const chatId = chat!.id;
      const base = Date.now() - n * 10_000;
      const rows = Array.from({ length: n }, (_, i) => [
        {
          chatId,
          userId,
          role: "user" as const,
          parts: [{ type: "text", text: `Pregunta ${String(i)} sobre mis marquesitas${RELLENO}` }],
          createdAt: new Date(base + i * 2_000),
        },
        {
          chatId,
          userId,
          role: "assistant" as const,
          parts: [
            { type: "text", text: `Respuesta ${String(i)}${RELLENO}` },
            ...(i === 0
              ? [
                  {
                    type: "tool-crear_borrador_visual",
                    toolCallId: "t0",
                    state: "output-available",
                    input: {},
                    output: {
                      cardId: "11111111-1111-4111-8111-111111111111",
                      network: "instagram",
                      status: "draft",
                      content: VISUAL,
                    },
                  },
                ]
              : []),
          ],
          createdAt: new Date(base + i * 2_000 + 1_000),
        },
      ]).flat();
      const inserted = await tx.insert(messages).values(rows).returning({ id: messages.id });
      return { chatId, ids: inserted.map((r) => r.id) };
    });
  }

  const resumenDe = (chatId: string) =>
    dbService.runWithTenant(userId, async (tx) => {
      const [row] = await tx.select().from(chatSummaries).where(eq(chatSummaries.chatId, chatId));
      return row;
    });
  const cobros = () =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "history_compaction"))),
    );

  it("resume el tramo viejo, deja los últimos 10 completos, lista las cards y cobra una vez", async () => {
    const { chatId, ids } = await chatLargo(12); // 24 mensajes de ~1.1k → se quedan los últimos 10 (~11k), resume 14
    const prompts: string[] = [];
    await crear("- Vende marquesitas en Santa Ana.", prompts).compact({ userId, chatId });

    const row = await resumenDe(chatId);
    expect(row?.summary).toBe("- Vende marquesitas en Santa Ana.");
    expect(row?.throughMessageId).toBe(ids[13]);
    expect(row?.cards).toEqual([
      expect.objectContaining({
        cardId: "11111111-1111-4111-8111-111111111111",
        network: "instagram",
      }),
    ]);
    expect(prompts[0]).toContain("Pregunta 0");
    expect(prompts[0]).not.toContain("Pregunta 7"); // ya es parte de lo reciente que se queda
    expect(await cobros()).toHaveLength(1);
    const usos = await dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(aiUsageEvents)
        .where(
          and(eq(aiUsageEvents.chatId, chatId), eq(aiUsageEvents.taskKind, "history_compaction")),
        ),
    );
    expect(usos).toHaveLength(1);

    // Un segundo job (pg-boss puede encolar otro mientras este corre): no hay
    // tramo nuevo que resumir, así que ni llama al modelo ni cobra.
    await crear("otra cosa", prompts).compact({ userId, chatId });
    expect(prompts).toHaveLength(1);
    expect(await cobros()).toHaveLength(1);

    // Otro usuario no ve el resumen (RLS).
    const ajeno = await dbService.runWithTenant(otherUser, (tx) =>
      tx.select().from(chatSummaries).where(eq(chatSummaries.chatId, chatId)),
    );
    expect(ajeno).toEqual([]);
  });

  it("solo encola si el contexto pasa del umbral y hay tramo suficiente", async () => {
    const encolados: unknown[] = [];
    const { HistoryCompactionService } = await import("./history-compaction.service.js");
    const service = new HistoryCompactionService(
      dbService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        enqueue: (_q: string, data: unknown) => (encolados.push(data), Promise.resolve(true)),
      } as never,
    );
    // Mensajes de ~1.1k tokens, como los de chatLargo.
    const pendientes = (n: number): UIMessage[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `m${String(i)}`,
        role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
        parts: [{ type: "text" as const, text: `Mensaje ${String(i)}${RELLENO}` }],
      }));
    await service.maybeEnqueue(userId, "c", 1_000, pendientes(30)); // contexto chico
    await service.maybeEnqueue(userId, "c", 90_000, pendientes(10)); // todo cabe en lo reciente
    expect(encolados).toHaveLength(0);
    await service.maybeEnqueue(userId, "c", 90_000, pendientes(30));
    expect(encolados).toEqual([{ userId, chatId: "c" }]);
  });

  it("la siguiente compactación integra el resumen anterior y avanza el corte", async () => {
    const { chatId, ids } = await chatLargo(12);
    await crear("Resumen uno", []).compact({ userId, chatId });
    // El chat sigue: 8 intercambios más.
    await dbService.runWithTenant(userId, async (tx) => {
      const base = Date.now();
      await tx.insert(messages).values(
        Array.from({ length: 8 }, (_, i) => [
          {
            chatId,
            userId,
            role: "user" as const,
            parts: [{ type: "text", text: `Nueva ${String(i)}${RELLENO}` }],
            createdAt: new Date(base + i * 2_000),
          },
          {
            chatId,
            userId,
            role: "assistant" as const,
            parts: [{ type: "text", text: `Va${RELLENO}` }],
            createdAt: new Date(base + i * 2_000 + 1_000),
          },
        ]).flat(),
      );
    });
    const prompts: string[] = [];
    await crear("Resumen dos", prompts).compact({ userId, chatId });
    expect(prompts[0]).toContain("Resumen uno");
    expect(prompts[0]).not.toContain("Pregunta 0"); // ya estaba en el resumen anterior
    const row = await resumenDe(chatId);
    expect(row?.summary).toBe("Resumen dos");
    expect(row?.throughMessageId).not.toBe(ids[13]);
    // La card del primer tramo sigue en la lista.
    expect(row?.cards).toHaveLength(1);
  });

  it("si el último mensaje del resumen ya no existe, sigue desde su fecha y no desde cero", async () => {
    const { chatId, ids } = await chatLargo(12);
    await crear("Resumen uno", []).compact({ userId, chatId });
    await dbService.runWithTenant(userId, async (tx) => {
      await tx.delete(messages).where(eq(messages.id, ids[13]!));
      const base = Date.now();
      await tx.insert(messages).values(
        Array.from({ length: 8 }, (_, i) => [
          {
            chatId,
            userId,
            role: "user" as const,
            parts: [{ type: "text", text: `Nueva ${String(i)}${RELLENO}` }],
            createdAt: new Date(base + i * 2_000),
          },
          {
            chatId,
            userId,
            role: "assistant" as const,
            parts: [{ type: "text", text: `Va${RELLENO}` }],
            createdAt: new Date(base + i * 2_000 + 1_000),
          },
        ]).flat(),
      );
    });
    const prompts: string[] = [];
    await crear("Resumen dos", prompts).compact({ userId, chatId });
    // Integra el anterior y no vuelve a mandar lo que ya cubría.
    expect(prompts[0]).toContain("Resumen uno");
    expect(prompts[0]).not.toContain("Pregunta 0");
    // Y se guarda: empezar de cero no habría llegado más lejos que el anterior.
    const row = await resumenDe(chatId);
    expect(row?.summary).toBe("Resumen dos");
  });
});
