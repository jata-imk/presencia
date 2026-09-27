import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BrandVoiceForPrompt } from "@presencia/shared";
import { aiUsageEvents, creditLedger, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll (env.ts
// valida el entorno al importar), mismo patrón que trends/telemetria.spec.ts.
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { EjemploDeVozService as EjemploDeVozServiceType } from "./ejemplo.service.js";

// "Ver ejemplo de tu voz" contra Postgres real: lo que se prueba es el
// dinero —que un ejemplo cobre por tokens con su propio motivo, que uno vacío
// no cobre— y que la llamada deje su fila de telemetría pase lo que pase.

const VOZ: BrandVoiceForPrompt = {
  marketCountry: "MX",
  marketRegion: "Yucatán",
  niche: ["repostería"],
  audience: null,
  register: "informal",
  formality: 35,
  allowedExpressions: [],
  bannedExpressions: [],
  useAnglicisms: true,
  keyTopics: ["pasteles de temporada"],
  preferredCtas: [],
  referenceExamples: [],
};

const USAGE = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 150, text: 150, reasoning: undefined },
};

function modelo(texto: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: texto }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
  });
}

let dbService: DbServiceType;
let crear: (texto: string, voz?: BrandVoiceForPrompt | null) => EjemploDeVozServiceType;
const usuarios: string[] = [];
let userId: string;

function movimientos(reason: "voice_preview") {
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, reason))),
  );
}

function usos() {
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), eq(aiUsageEvents.taskKind, "voice_preview"))),
  );
}

describe("EjemploDeVozService", () => {
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
    const { EjemploDeVozService } = await import("./ejemplo.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());

    crear = (texto, voz = VOZ) => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(texto),
          id: "google:mock-chat",
          provider: "google",
          modelName: "mock-chat",
        }),
      };
      const voces = { getDefaultForPrompt: () => Promise.resolve(voz) };
      return new EjemploDeVozService(dbService, ai as never, aiUsage, credits, voces as never);
    };
  }, 30_000);

  beforeEach(async () => {
    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Ejemplo", email: `ejemplo-${randomUUID()}@test.local`, emailVerified: true })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    usuarios.push(user.id);
    userId = user.id;
  });

  afterAll(async () => {
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("devuelve el texto, cobra por tokens y deja su fila", { timeout: 15_000 }, async () => {
    const resultado = await crear("  Pasteles de temporada, ¿ya probaste el de mango?  ").generar(
      userId,
    );
    expect(resultado).toEqual({ text: "Pasteles de temporada, ¿ya probaste el de mango?" });

    const [cobro, ...otros] = await movimientos("voice_preview");
    expect(otros).toHaveLength(0);
    expect(cobro?.delta).toBeLessThan(0);
    // Efímero: no hay fila a la que apuntar.
    expect(cobro?.referenceId).toBeNull();

    const [uso] = await usos();
    expect(uso).toMatchObject({ inputTokens: 900, outputTokens: 150, searchQueries: null });
  });

  it("un texto vacío no cobra, pero la llamada queda registrada", { timeout: 15_000 }, async () => {
    await expect(crear("   ").generar(userId)).rejects.toThrow("No pudimos escribir el ejemplo");
    expect(await movimientos("voice_preview")).toHaveLength(0);
    expect(await usos()).toHaveLength(1);
  });

  it("sin voz de marca no llama al modelo", { timeout: 15_000 }, async () => {
    await expect(crear("x", null).generar(userId)).rejects.toThrow("Aún no configuras");
    expect(await usos()).toHaveLength(0);
  });
});
