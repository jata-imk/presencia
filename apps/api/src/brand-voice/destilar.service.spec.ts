import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiUsageEvents, brandVoices, creditLedger, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll (env.ts
// valida el entorno al importar), mismo patrón que ejemplo.service.spec.ts.
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { DestilarVozService as DestilarVozServiceType } from "./destilar.service.js";

// Destilar la voz contra Postgres real: lo que se prueba es el dinero —que
// cobra por tokens con su propio motivo, también cuando el modelo devuelve
// algo que no pasa el schema— y que NO guarda nada en la voz: devuelve una
// propuesta que el creator confirma.

const USAGE = {
  inputTokens: { total: 1200, noCache: 1200, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 200, text: 200, reasoning: undefined },
};

const VOZ = {
  styleNotes: ["Frases cortas", "Cierra con una pregunta"],
  formality: 30,
  allowedExpressions: ["neta"],
  bannedExpressions: [],
  useAnglicisms: false,
  preferredCtas: ["Cae por acá"],
  keyTopics: ["marquesitas"],
};

function modelo(salida: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: salida }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
  });
}

const BODY = {
  samples: ["Hoy hay marquesitas de cajeta en el parque, cae temprano que se acaban."],
  avoid: "¡Hola, familia!",
};

let dbService: DbServiceType;
let crear: (salida: string) => DestilarVozServiceType;
const usuarios: string[] = [];
let userId: string;

function movimientos() {
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "voice_distill"))),
  );
}

function usos() {
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), eq(aiUsageEvents.taskKind, "voice_distill"))),
  );
}

describe("DestilarVozService", () => {
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
    const { DestilarVozService } = await import("./destilar.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());

    crear = (salida) => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(salida),
          id: "openai:mock-adapt",
          provider: "openai",
          modelName: "mock-adapt",
        }),
      };
      return new DestilarVozService(dbService, ai as never, aiUsage, credits);
    };
  }, 30_000);

  beforeEach(async () => {
    const [user] = await dbService.db
      .insert(users)
      .values({
        name: "Destilar",
        email: `destilar-${randomUUID()}@test.local`,
        emailVerified: true,
      })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    usuarios.push(user.id);
    userId = user.id;
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .insert(brandVoices)
        .values({ userId, name: "Mi voz", isDefault: true, niche: ["postres"] }),
    );
  });

  afterAll(async () => {
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("devuelve la propuesta, cobra por tokens y no toca la voz", { timeout: 15_000 }, async () => {
    const propuesta = await crear(JSON.stringify(VOZ)).destilar(userId, BODY);
    expect(propuesta).toEqual(VOZ);

    const [cobro, ...otros] = await movimientos();
    expect(otros).toHaveLength(0);
    expect(cobro?.delta).toBeLessThan(0);
    expect(cobro?.referenceId).toBeNull();

    const [uso] = await usos();
    expect(uso).toMatchObject({ inputTokens: 1200, outputTokens: 200 });

    // La voz es del creator: destilar no guarda nada.
    const [voz] = await dbService.runWithTenant(userId, (tx) =>
      tx.select({ notas: brandVoices.styleNotes }).from(brandVoices),
    );
    expect(voz?.notas).toEqual([]);
  });

  it(
    "una salida que no pasa el schema se cobra y avisa, sin propuesta",
    { timeout: 15_000 },
    async () => {
      await expect(crear('{"styleNotes": []}').destilar(userId, BODY)).rejects.toThrow(
        "No pudimos leer tus publicaciones",
      );
      expect(await movimientos()).toHaveLength(1);
      expect(await usos()).toHaveLength(1);
    },
  );
});
