import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CardContent } from "@presencia/shared";
import {
  aiUsageEvents,
  cardVersions,
  chats,
  creditLedger,
  messages,
  publicationCards,
  users,
} from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { CardRewriteService as CardRewriteServiceType } from "./card-rewrite.service.js";

// "Pide un cambio a este borrador" (F10.5 PR4) contra Postgres real, con el
// modelo simulado: lo que se prueba es que el cambio quede como VERSIÓN de la
// misma card, que se cobre una vez por tokens con su motivo, que lo que falla
// no deje versión y que el modelo reciba la conversación donde nació la card.

const USAGE = {
  inputTokens: { total: 1200, noCache: 1200, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 180, text: 180, reasoning: undefined },
};

const VISUAL: CardContent = {
  archetype: "visual_first",
  caption: "Tres tips largos para preparar café en casa con prensa francesa.",
  hashtags: ["cafe"],
  imagePrompt: "una prensa francesa",
  assetIds: [],
};

let dbService: DbServiceType;
let crear: (
  respuesta: string,
  capturar?: (prompt: string) => void,
  tardaMs?: number,
) => CardRewriteServiceType;
const usuarios: string[] = [];
let userId: string;
let chatId: string;

function modelo(
  texto: string,
  capturar?: (prompt: string) => void,
  tardaMs = 0,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      capturar?.(JSON.stringify(options.prompt));
      // Un modelo lento que, como los reales, se corta al abortar.
      if (tardaMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, tardaMs);
          options.abortSignal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("Abortada", "AbortError"));
          });
        });
      }
      return {
        content: [{ type: "text", text: texto }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  });
}

async function createCard(status: "draft" | "scheduled" = "draft"): Promise<string> {
  return dbService.runWithTenant(userId, async (tx) => {
    const [card] = await tx
      .insert(publicationCards)
      .values({
        userId,
        chatId,
        network: "instagram",
        archetype: "visual_first",
        content: VISUAL,
        status,
        scheduledAt: status === "scheduled" ? new Date(Date.now() + 3_600_000) : null,
      })
      .returning({ id: publicationCards.id });
    await tx.insert(messages).values([
      {
        chatId,
        userId,
        role: "user",
        parts: [{ type: "text", text: "Hazme un post sobre café con prensa francesa" }],
      },
      {
        chatId,
        userId,
        role: "assistant",
        parts: [
          { type: "text", text: "Listo, aquí va tu borrador de Instagram." },
          {
            type: "tool-crear_borrador_visual",
            toolCallId: "call-1",
            state: "output-available",
            input: {},
            output: { cardId: card!.id, network: "instagram", status: "draft", content: VISUAL },
          },
        ],
      },
    ]);
    return card!.id;
  });
}

const cobros = () =>
  dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "card_rewrite"))),
  );
const versiones = (cardId: string) =>
  dbService.runWithTenant(userId, (tx) =>
    tx.select().from(cardVersions).where(eq(cardVersions.cardId, cardId)),
  );

describe("CardRewriteService", () => {
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
    const { CardVersionsRepository } = await import("../cards/card-versions.repository.js");
    const { CardContentService } = await import("../cards/card-content.service.js");
    const { ChatRepository } = await import("./chat.repository.js");
    const { CardRewriteService } = await import("./card-rewrite.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());
    const cardsRepo = new CardsRepository();
    const content = new CardContentService(dbService, cardsRepo, new CardVersionsRepository());

    crear = (respuesta, capturar, tardaMs) => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(respuesta, capturar, tardaMs),
          id: "google:mock-adapt",
          provider: "google",
          modelName: "mock-adapt",
        }),
      };
      const voces = { getDefaultForPrompt: () => Promise.resolve(null) };
      return new CardRewriteService(
        dbService,
        ai as never,
        aiUsage,
        credits,
        voces as never,
        cardsRepo,
        content,
        new ChatRepository(),
      );
    };
  }, 30_000);

  beforeEach(async () => {
    const [user] = await dbService.db
      .insert(users)
      .values({
        name: "Reescribir",
        email: `reescribir-${randomUUID()}@test.local`,
        emailVerified: true,
      })
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
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it(
    "deja el cambio como versión de la misma card y cobra una vez",
    { timeout: 20_000 },
    async () => {
      const cardId = await createCard();
      let prompt = "";
      const result = await crear(
        JSON.stringify({ caption: "Café rico en casa.", hashtags: ["#cafe", "##prensa"] }),
        (p) => (prompt = p),
      ).rewrite(userId, cardId, "Hazlo más corto");

      expect(result.version).toMatchObject({ n: 2, source: "ai", instruction: "Hazlo más corto" });
      expect(result.changed).toBe(true);
      expect(result.card.content).toMatchObject({
        caption: "Café rico en casa.",
        hashtags: ["cafe", "prensa"],
        // Lo que la reescritura no toca, se queda.
        imagePrompt: "una prensa francesa",
      });
      expect((await versiones(cardId)).map((v) => v.source).sort()).toEqual(["ai", "chat"]);
      const [cobro, ...otros] = await cobros();
      expect(otros).toHaveLength(0);
      expect(cobro?.delta).toBeLessThan(0);

      // El modelo recibió la instrucción, el borrador y la conversación.
      expect(prompt).toContain("Hazlo más corto");
      expect(prompt).toContain("Tres tips largos");
      expect(prompt).toContain("Hazme un post sobre café con prensa francesa");

      const usos = await dbService.runWithTenant(userId, (tx) =>
        tx.select().from(aiUsageEvents).where(eq(aiUsageEvents.taskKind, "post_adapt")),
      );
      expect(usos).toHaveLength(1);
    },
  );

  it(
    "una respuesta que no es el objeto se cobra pero no deja versión",
    { timeout: 20_000 },
    async () => {
      const cardId = await createCard();
      await expect(crear("esto no es json").rewrite(userId, cardId, "Más formal")).rejects.toThrow(
        /No pude reescribir/,
      );
      expect(await versiones(cardId)).toHaveLength(0);
      expect(await cobros()).toHaveLength(1);
    },
  );

  it("detenerla no cobra ni deja versión", { timeout: 20_000 }, async () => {
    const cardId = await createCard();
    const abort = new AbortController();
    abort.abort();
    await expect(
      crear(JSON.stringify({ caption: "x", hashtags: [] })).rewrite(
        userId,
        cardId,
        "Más corto",
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(await versiones(cardId)).toHaveLength(0);
    expect(await cobros()).toHaveLength(0);
  });

  it(
    "cancel() la detiene a media llamada: sin versión, sin cobro y sin candado",
    {
      timeout: 20_000,
    },
    async () => {
      const cardId = await createCard();
      const service = crear(JSON.stringify({ caption: "Tarde", hashtags: [] }), undefined, 5000);
      const running = service.rewrite(userId, cardId, "Más corto");
      // El DELETE llega mientras el modelo sigue generando.
      await new Promise((r) => setTimeout(r, 1500));
      expect(service.cancel(userId, cardId)).toBe(true);
      await expect(running).rejects.toThrow(/Se detuvo/);
      expect(await versiones(cardId)).toHaveLength(0);
      expect(await cobros()).toHaveLength(0);
      // El candado se soltó: se puede pedir otra vez.
      expect(service.cancel(userId, cardId)).toBe(false);
    },
  );

  it("una sola reescritura por card a la vez", { timeout: 20_000 }, async () => {
    const cardId = await createCard();
    const service = crear(JSON.stringify({ caption: "Una", hashtags: [] }));
    const first = service.rewrite(userId, cardId, "Más corto");
    await expect(service.rewrite(userId, cardId, "Más formal")).rejects.toThrow(/Ya estoy/);
    await first;
  });

  it("no reescribe una card programada ni llama al modelo", { timeout: 20_000 }, async () => {
    const cardId = await createCard("scheduled");
    let llamado = false;
    await expect(
      crear("{}", () => (llamado = true)).rewrite(userId, cardId, "Más corto"),
    ).rejects.toThrow(/programada/);
    expect(llamado).toBe(false);
  });
});
