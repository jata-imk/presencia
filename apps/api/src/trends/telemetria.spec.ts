import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsageEvents, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que trends.repository.spec.ts (env.ts valida el entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { TrendsService as TrendsServiceType } from "./trends.service.js";
import type { ContextoDeBusqueda } from "./prompt.js";

// F9.8: cada llamada de un refresco de tendencias deja su fila en
// `ai_usage_events`, salga bien o mal. Contra Postgres real porque lo que se
// prueba es la fila —con su `task_kind` nuevo y su `search_queries`—, y con
// modelos falsos porque lo que importa no es qué contesta el modelo sino que
// cada camino, incluidos los que tiran la búsqueda ya pagada, la registre.

const CONTEXTO: ContextoDeBusqueda = {
  vertical: "tech",
  region: "sureste",
  marketCountry: "MX",
  niche: ["tecnología"],
  audience: null,
  modo: "crecer",
  fuentes: [],
  prompt: null,
  excluye: null,
  langs: ["es"],
};

const USAGE_BUSQUEDA = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 80, text: 80, reasoning: undefined },
};
const USAGE_ESTRUCTURA = {
  inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 60, text: 60, reasoning: undefined },
};
const FIN = { unified: "stop" as const, raw: undefined };

const CON_FUENTES = {
  google: {
    groundingMetadata: {
      webSearchQueries: ["uno", "dos", "tres", "cuatro"],
      groundingChunks: [{ web: { uri: "https://ejemplo.mx/nota", title: "ejemplo.mx" } }],
    },
  },
};
const SIN_FUENTES = {
  google: { groundingMetadata: { webSearchQueries: ["uno", "dos"], groundingChunks: [] } },
};

const TENDENCIA = {
  topic: "Setups de escritorio minimalistas",
  signal: "rising",
  network: "instagram",
  format: "carrusel",
  blurb: "Se está moviendo en cuentas de productividad.",
  sourceIndex: 0,
  titulo: null,
  gancho: null,
};

function modeloDeBusqueda(providerMetadata: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: "Prosa de la búsqueda." }],
        finishReason: FIN,
        usage: USAGE_BUSQUEDA,
        providerMetadata: providerMetadata as never,
        warnings: [],
      }),
  });
}

function modeloDeEstructura(texto: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: texto }],
        finishReason: FIN,
        usage: USAGE_ESTRUCTURA,
        warnings: [],
      }),
  });
}

let dbService: DbServiceType;
let crearServicio: (
  busqueda: MockLanguageModelV4,
  estructura: MockLanguageModelV4,
) => TrendsServiceType;
const usuarios: string[] = [];
let userId: string;

async function nuevoUsuario(): Promise<string> {
  const [user] = await dbService.db
    .insert(users)
    .values({
      name: "Telemetría",
      email: `telemetria-${randomUUID()}@test.local`,
      emailVerified: true,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario de prueba");
  usuarios.push(user.id);
  return user.id;
}

function filas() {
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId))
      .orderBy(aiUsageEvents.createdAt),
  );
}

describe("telemetría de tendencias (F9.8)", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { TrendsRepository } = await import("./trends.repository.js");
    const { TrendsService } = await import("./trends.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const repo = new TrendsRepository();

    crearServicio = (busqueda, estructura) => {
      const ai = {
        resolve: () => ({
          model: busqueda,
          id: "google:mock-busqueda",
          provider: "google",
          modelName: "mock-busqueda",
        }),
        resolveForTask: () => ({
          model: estructura,
          id: "google:mock-estructura",
          provider: "google",
          modelName: "mock-estructura",
        }),
      };
      // Voz, créditos y cola no se tocan sin cobro: el contexto se inyecta.
      const service = new TrendsService(
        dbService,
        ai as never,
        aiUsage,
        repo,
        {} as never,
        {} as never,
        {} as never,
      );
      vi.spyOn(service, "contextoDe").mockResolvedValue(CONTEXTO);
      return service;
    };
  }, 30_000);

  beforeEach(async () => {
    userId = await nuevoUsuario();
  });

  afterAll(async () => {
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("un refresco exitoso deja una fila por llamada", { timeout: 15_000 }, async () => {
    const service = crearServicio(
      modeloDeBusqueda(CON_FUENTES),
      modeloDeEstructura(JSON.stringify({ tendencias: [TENDENCIA] })),
    );
    const resultado = await service.refrescarUsuario(userId);
    expect(resultado.items).toHaveLength(1);

    const registradas = await filas();
    expect(registradas.map((f) => f.taskKind)).toEqual(["trends_search", "trends_structure"]);
    const [busqueda, estructura] = registradas;
    expect(busqueda).toMatchObject({
      provider: "google",
      model: "mock-busqueda",
      inputTokens: 120,
      outputTokens: 80,
      searchQueries: 4,
      chatId: null,
    });
    // La estructura no busca: `null`, no cero.
    expect(estructura).toMatchObject({
      model: "mock-estructura",
      inputTokens: 300,
      outputTokens: 60,
      searchQueries: null,
    });
  });

  it("sin fuentes registra la búsqueda que se pagó", { timeout: 15_000 }, async () => {
    const service = crearServicio(modeloDeBusqueda(SIN_FUENTES), modeloDeEstructura("{}"));
    await service.refrescarUsuario(userId);

    const registradas = await filas();
    expect(registradas.map((f) => f.taskKind)).toEqual(["trends_search"]);
    expect(registradas[0]?.searchQueries).toBe(2);
  });

  it("sin items citables registra las dos llamadas", { timeout: 15_000 }, async () => {
    // Índice fuera de la lista de fuentes: `ensamblarTendencias` lo descarta.
    const service = crearServicio(
      modeloDeBusqueda(CON_FUENTES),
      modeloDeEstructura(JSON.stringify({ tendencias: [{ ...TENDENCIA, sourceIndex: 9 }] })),
    );
    const resultado = await service.refrescarUsuario(userId);
    expect(resultado.items).toHaveLength(0);

    const registradas = await filas();
    expect(registradas.map((f) => f.taskKind)).toEqual(["trends_search", "trends_structure"]);
  });

  it(
    "una estructura que no pasa el schema se registra y la llamada truena",
    { timeout: 15_000 },
    async () => {
      const service = crearServicio(
        modeloDeBusqueda(CON_FUENTES),
        modeloDeEstructura("esto no es json"),
      );
      await expect(service.refrescarUsuario(userId)).rejects.toThrow();

      const registradas = await filas();
      expect(registradas.map((f) => f.taskKind)).toEqual(["trends_search", "trends_structure"]);
      expect(registradas[1]?.inputTokens).toBe(300);
    },
  );

  it(
    "un proveedor que rechaza la estructura deja solo la búsqueda",
    { timeout: 15_000 },
    async () => {
      const rechazo = new MockLanguageModelV4({
        doGenerate: () => Promise.reject(new Error("schema rechazado por el proveedor")),
      });
      const service = crearServicio(modeloDeBusqueda(CON_FUENTES), rechazo);
      await expect(service.refrescarUsuario(userId)).rejects.toThrow();

      const registradas = await filas();
      expect(registradas.map((f) => f.taskKind)).toEqual(["trends_search"]);
    },
  );

  it(
    "el gasto de tendencias se suma por mes y por task_kind sin mirar user_trends",
    { timeout: 15_000 },
    async () => {
      const service = crearServicio(
        modeloDeBusqueda(CON_FUENTES),
        modeloDeEstructura(JSON.stringify({ tendencias: [TENDENCIA] })),
      );
      await service.refrescarUsuario(userId);
      await service.refrescarUsuario(userId);

      const inicioDeMes = sql<Date>`date_trunc('month', now())`;
      const gasto = await dbService.runWithTenant(userId, (tx) =>
        tx
          .select({
            task: aiUsageEvents.taskKind,
            tokens: sql<number>`sum(${aiUsageEvents.inputTokens} + ${aiUsageEvents.outputTokens})::int`,
            consultas: sql<number | null>`sum(${aiUsageEvents.searchQueries})::int`,
          })
          .from(aiUsageEvents)
          .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, inicioDeMes)))
          .groupBy(aiUsageEvents.taskKind)
          .orderBy(aiUsageEvents.taskKind),
      );
      expect(gasto).toEqual([
        { task: "trends_search", tokens: 400, consultas: 8 },
        { task: "trends_structure", tokens: 720, consultas: null },
      ]);
    },
  );
});
