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
    modo: null,
    trendPrompt: null,
    trendExclude: null,
    trendLangs: ["es"],
    niche: ["comida"],
    vertical: null,
    audience: null,
    register: "neutro_profesional",
    formality: 55,
    allowedExpressions: [],
    bannedExpressions: [],
    useAnglicisms: true,
    keyTopics: [],
    preferredCtas: [],
    referenceExamples: [],
    imageStyle: null,
    styleNotes: [],
    businessFacts: null,
    lastVoiceExample: null,
    learnFromEdits: true,
    voiceProposalDecisions: {},
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
    upsertDefault: vi.fn(),
    updateDefault: vi.fn(),
    saveLastExample: vi.fn(),
    ...overrides,
  };
}

describe("BrandVoiceService — formality ↔ register (doc §4)", () => {
  it("upsertDefault (onboarding) deriva formality del register elegido", async () => {
    const repo = makeRepo({
      upsertDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, input: object) => Promise.resolve(makeRow(input))),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.upsertDefault("user-1", {
      marketCountry: "MX",
      niche: ["comida"],
      register: "de_barrio",
    });

    expect(repo.upsertDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ register: "de_barrio", formality: 15 }),
    );
  });

  it("upsertDefault es un UPSERT atómico: no llama findDefault (evita la race del doble-submit)", async () => {
    const repo = makeRepo({
      upsertDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, input: object) => Promise.resolve(makeRow(input))),
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.upsertDefault("user-1", {
      marketCountry: "MX",
      niche: ["comida"],
      register: "profesional",
    });

    expect(repo.findDefault).not.toHaveBeenCalled();
    expect(repo.upsertDefault).toHaveBeenCalledTimes(1);
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
      expect.anything(),
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
      expect.anything(),
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
      expect.anything(),
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
      expect.anything(),
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
      expect.anything(),
    );
  });
});

describe("BrandVoiceService — qué cuenta como cambio de voz (F12.5)", () => {
  const conRepo = () => {
    const existing = makeRow({ styleNotes: ["Frases cortas"] });
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(existing),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) =>
          Promise.resolve(makeRow({ ...existing, ...patch })),
        ),
    });
    return { repo, service: new BrandVoiceService(makeDbService(), repo) };
  };
  const suena = (repo: BrandVoiceRepository) =>
    vi.mocked(repo.updateDefault).mock.calls[0]?.[2]?.suena;

  it("un rasgo nuevo suena; reenviar los mismos no", async () => {
    const a = conRepo();
    await a.service.updateDefault("user-1", { styleNotes: ["Frases cortas", "Sin emojis"] });
    expect(suena(a.repo)).toBe(true);

    const b = conRepo();
    await b.service.updateDefault("user-1", { styleNotes: ["Frases cortas"] });
    expect(suena(b.repo)).toBe(false);
  });

  it("el estilo de imagen no suena", async () => {
    const { repo, service } = conRepo();
    await service.updateDefault("user-1", { imageStyle: null });
    expect(suena(repo)).toBe(false);
  });
});

describe("BrandVoiceService — estilo visual (F10.6)", () => {
  it("guarda el estilo elegido y lo devuelve en el DTO", async () => {
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(makeRow()),
      updateDefault: vi
        .fn()
        .mockImplementation((_tx: Tx, patch: object) => Promise.resolve(makeRow(patch))),
    });
    const service = new BrandVoiceService(makeDbService(), repo);
    const dto = await service.updateDefault("user-1", { imageStyle: "neo" });
    expect(repo.updateDefault).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ imageStyle: "neo" }),
      expect.anything(),
    );
    expect(dto.imageStyle).toBe("neo");
  });

  it("un estilo guardado que ya no está en el catálogo viaja como null", async () => {
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(makeRow({ imageStyle: "viejo" })),
    });
    const service = new BrandVoiceService(makeDbService(), repo);
    expect((await service.getDefault("user-1")).imageStyle).toBeNull();
  });

  it("el PATCH rechaza un estilo que no existe", () => {
    expect(updateBrandVoiceBodySchema.safeParse({ imageStyle: "acuarela" }).success).toBe(false);
    expect(updateBrandVoiceBodySchema.safeParse({ imageStyle: null }).success).toBe(true);
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

  // F12.5: «Así escribes» y los datos fijos también viajan en cada generación.
  it("topa styleNotes a 8 rasgos de 140 y businessFacts a 1000", () => {
    const rasgos = (n: number, largo = 10) => Array.from({ length: n }, () => "x".repeat(largo));
    expect(updateBrandVoiceBodySchema.safeParse({ styleNotes: rasgos(8) }).success).toBe(true);
    expect(updateBrandVoiceBodySchema.safeParse({ styleNotes: rasgos(9) }).success).toBe(false);
    expect(updateBrandVoiceBodySchema.safeParse({ styleNotes: rasgos(1, 141) }).success).toBe(
      false,
    );
    expect(updateBrandVoiceBodySchema.safeParse({ businessFacts: "x".repeat(1000) }).success).toBe(
      true,
    );
    expect(updateBrandVoiceBodySchema.safeParse({ businessFacts: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe("BrandVoiceService — datos fijos (F12.5)", () => {
  it('vaciar los datos fijos los borra ("" se guarda como null)', async () => {
    const updateDefault = vi.fn().mockResolvedValue(makeRow());
    const repo = makeRepo({
      findDefault: vi.fn().mockResolvedValue(makeRow({ businessFacts: "viejo" })),
      updateDefault,
    });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault(
      "user-1",
      updateBrandVoiceBodySchema.parse({ businessFacts: "  " }),
    );
    expect(updateDefault.mock.calls[0]?.[1]).toMatchObject({ businessFacts: null });
  });

  it("los rasgos repetidos se guardan una sola vez", async () => {
    const updateDefault = vi.fn().mockResolvedValue(makeRow());
    const repo = makeRepo({ findDefault: vi.fn().mockResolvedValue(makeRow()), updateDefault });
    const service = new BrandVoiceService(makeDbService(), repo);

    await service.updateDefault("user-1", {
      styleNotes: ["Frases cortas", "frases cortas", "Cierra con pregunta"],
    });
    expect(updateDefault.mock.calls[0]?.[1]).toMatchObject({
      styleNotes: ["Frases cortas", "Cierra con pregunta"],
    });
  });

  it("el DTO trae el último ejemplo, y uno mal formado se lee como null", async () => {
    const ejemplo = { text: "Hola", generatedAt: "2026-11-07T10:00:00.000Z" };
    const conEjemplo = new BrandVoiceService(
      makeDbService(),
      makeRepo({ findDefault: vi.fn().mockResolvedValue(makeRow({ lastVoiceExample: ejemplo })) }),
    );
    expect((await conEjemplo.getDefault("user-1")).lastVoiceExample).toEqual(ejemplo);

    const roto = new BrandVoiceService(
      makeDbService(),
      makeRepo({ findDefault: vi.fn().mockResolvedValue(makeRow({ lastVoiceExample: { x: 1 } })) }),
    );
    expect((await roto.getDefault("user-1")).lastVoiceExample).toBeNull();
  });
});
