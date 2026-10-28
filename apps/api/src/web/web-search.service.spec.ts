import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WebSearchResult } from "@presencia/shared";
import { aiUsageEvents, chats, creditLedger, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { SearchProvider } from "./search-provider.js";
import type { WebSearchService as WebSearchServiceType } from "./web-search.service.js";

// F10.10: una búsqueda del chat contra Postgres real, con el buscador de
// mentira: que cobre una vez con su referencia, que deje su fila de gasto, y
// que un buscador caído no cobre ni lance.

const RESULTADO: WebSearchResult = {
  titulo: "Precio del café",
  url: "https://www.yucatan.com.mx/cafe",
  dominio: "yucatan.com.mx",
  fragmento: "Entre 45 y 60 pesos.",
  fecha: null,
};

let dbService: DbServiceType;
let crear: (search: SearchProvider["search"]) => WebSearchServiceType;
let userId: string;
let chatId: string;

describe("WebSearchService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { WebSearchService } = await import("./web-search.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());
    crear = (search) =>
      new WebSearchService(dbService, credits, aiUsage, {
        provider: "brave",
        model: "web-search",
        search,
      });

    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Buscar", email: `buscar-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    userId = user!.id;
    chatId = await dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      return chat!.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userId]));
    await dbService.onModuleDestroy();
  });

  const cobrosDe = (searchId: string) =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(creditLedger)
        .where(
          and(eq(creditLedger.referenceType, "web_search"), eq(creditLedger.referenceId, searchId)),
        ),
    );

  it("busca, cobra la tarifa fija una vez y deja su fila de gasto", async () => {
    const runId = randomUUID();
    const out = await crear(() => Promise.resolve([RESULTADO])).search(
      userId,
      chatId,
      "precio del café en Mérida",
      runId,
    );
    expect(out).toMatchObject({ estado: "ok", resultados: [RESULTADO] });
    const cobros = await cobrosDe(out.searchId!);
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ reason: "web_search", delta: -75 });
    const [uso] = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(aiUsageEvents).where(eq(aiUsageEvents.runId, runId)),
    );
    expect(uso).toMatchObject({
      taskKind: "web_search",
      provider: "brave",
      model: "web-search",
      searchQueries: 1,
    });
  });

  it("sin resultados también se cobra (la búsqueda ya se pagó)", async () => {
    const out = await crear(() => Promise.resolve([])).search(userId, chatId, "nada", null);
    expect(out.estado).toBe("sin_resultados");
    expect(await cobrosDe(out.searchId!)).toHaveLength(1);
  });

  it("un buscador caído contesta no_disponible, sin cobrar ni lanzar", async () => {
    const out = await crear(() => Promise.reject(new Error("429"))).search(
      userId,
      chatId,
      "algo",
      null,
    );
    expect(out).toEqual({
      searchId: null,
      consulta: "algo",
      estado: "no_disponible",
      resultados: [],
    });
  });

  it("si el turno se cortó mientras buscaba, lanza", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      crear(() => Promise.reject(new Error("abortado"))).search(
        userId,
        chatId,
        "algo",
        null,
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
