import { NotFoundException } from "@nestjs/common";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createBrandVoiceBodySchema, updateBrandVoiceBodySchema } from "@presencia/shared";
import type { BrandVoiceRepository, BrandVoiceRow } from "./brand-voice.repository.js";
import type { DbService, Tx } from "../db/db.service.js";

// Unitario con repository mockeado — sin DB real. El aislamiento
// cross-tenant de brand_voices se prueba contra Postgres en db/rls.spec.ts.
//
// BrandVoiceService importa DbService como VALOR (@Inject la usa como
// token de DI), y eso arrastra db/client.ts → env.ts, que valida el
// entorno al importar (mismo problema que documenta db/rls.spec.ts). Se
// difiere el import hasta después de cargar el .env de la raíz.
let BrandVoiceService: typeof import("./brand-voice.service.js").BrandVoiceService;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  ({ BrandVoiceService } = await import("./brand-voice.service.js"));
});

function makeRow(overrides: Partial<BrandVoiceRow> = {}): BrandVoiceRow {
  return {
    id: "voice-1",
    userId: "user-1",
    name: "Mi voz",
    isDefault: true,
    marketCountry: "MX",
    marketRegion: "Yucatán",
    niche: ["comida"],
    audience: null,
    register: "neutro_profesional",
    formality: 55,
    allowedExpressions: [],
    bannedExpressions: [],
    useAnglicisms: true,
    keyTopics: [],
    preferredCtas: [],
    referenceExamples: [],
    extras: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// Ejecuta el callback directo, sin transacción real: runWithTenant en sí
// (SET LOCAL app.user_id + RLS) es responsabilidad de DbService, ya
// cubierta por db/rls.spec.ts contra Postgres real.
function makeDbService(): DbService {
  return {
    runWithTenant: <T>(_userId: string, fn: (tx: Tx) => Promise<T>) => fn({} as Tx),
  } as unknown as DbService;
}

function makeRepo(overrides: Partial<BrandVoiceRepository> = {}): BrandVoiceRepository {
  return {
    findDefault: vi.fn(),
    insertDefault: vi.fn(),
    updateDefault: vi.fn(),
    ...overrides,
  };
}

describe("BrandVoiceService — formality ↔ register (doc §4)", () => {
  it("upsertDefault (onboarding) deriva formality del register elegido", async () => {
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(undefined),
      insertDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, input: object) => Promise.resolve(makeRow(input))),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.upsertDefault("user-1", {
      marketCountry: "MX",
      niche: ["comida"],
      register: "de_barrio",
    });

    expect(repo.insertDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ register: "de_barrio", formality: 15 }),
    );
  });

  it("updateDefault (slider) recalcula register cuando llega formality", async () => {
    const existing = makeRow();
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", { formality: 92 });

    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ formality: 92, register: "tecnico" }),
    );
  });

  it("updateDefault (single-select) deriva formality cuando llega solo register", async () => {
    const existing = makeRow();
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", { register: "profesional" });

    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ register: "profesional", formality: 75 }),
    );
  });
});

describe("BrandVoiceService — prohibido gana (doc §6)", () => {
  it("saca de permitidos un término presente en las dos listas", async () => {
    const existing = makeRow();
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", {
      allowedExpressions: ["chido", "wey"],
      bannedExpressions: ["Wey"],
    });

    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedExpressions: ["chido"], bannedExpressions: ["Wey"] }),
    );
  });

  it("compara sin importar acentos ni mayúsculas", async () => {
    const existing = makeRow();
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", {
      allowedExpressions: ["órale"],
      bannedExpressions: ["orale"],
    });

    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedExpressions: [] }),
    );
  });

  it("no toca prohibidos ya persistidos al patchear solo permitidos", async () => {
    const existing = makeRow({ bannedExpressions: ["naco"] });
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", { allowedExpressions: ["naco", "chido"] });

    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedExpressions: ["chido"] }),
    );
  });
});

describe("BrandVoiceService — estados sin voz configurada", () => {
  it("getDefault truena con NotFoundException si el usuario no tiene voz", async () => {
    const repo = makeRepo({ findDefault: vi.fn().mockResolvedValue(undefined) });
    const service = new BrandVoiceService(makeDbService(), repo);

    await expect(service.getDefault("user-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getDefaultForPrompt devuelve null (no truena) para que el chat siga funcionando", async () => {
    const repo = makeRepo({ findDefault: vi.fn().mockResolvedValue(undefined) });
    const service = new BrandVoiceService(makeDbService(), repo);

    await expect(service.getDefaultForPrompt("user-1")).resolves.toBeNull();
  });
});

describe("Topes de tamaño (Zod) — todo campo viaja en cada generación", () => {
  it("createBrandVoiceBodySchema exige al menos 1 nicho y tope de 20", () => {
    expect(createBrandVoiceBodySchema.safeParse({ niche: [], register: "informal" }).success).toBe(
      false,
    );
    expect(
      createBrandVoiceBodySchema.safeParse({
        niche: Array.from({ length: 21 }, (_, i) => `nicho-${i}`),
        register: "informal",
      }).success,
    ).toBe(false);
    expect(
      createBrandVoiceBodySchema.safeParse({ niche: ["comida"], register: "informal" }).success,
    ).toBe(true);
  });

  it("updateBrandVoiceBodySchema topa formality a 0-100", () => {
    expect(updateBrandVoiceBodySchema.safeParse({ formality: -1 }).success).toBe(false);
    expect(updateBrandVoiceBodySchema.safeParse({ formality: 101 }).success).toBe(false);
    expect(updateBrandVoiceBodySchema.safeParse({ formality: 50 }).success).toBe(true);
  });

  it("updateBrandVoiceBodySchema topa referenceExamples a 2", () => {
    expect(
      updateBrandVoiceBodySchema.safeParse({
        referenceExamples: [{ text: "a" }, { text: "b" }, { text: "c" }],
      }).success,
    ).toBe(false);
    expect(
      updateBrandVoiceBodySchema.safeParse({ referenceExamples: [{ text: "a" }] }).success,
    ).toBe(true);
  });
});
