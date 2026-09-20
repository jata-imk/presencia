import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrendItem } from "@presencia/shared";
import { nicheTrends } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que metrics.repository.spec.ts (env.ts valida el entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type {
  TrendsRepository as TrendsRepositoryType,
  TuplaDeTendencias,
} from "./trends.repository.js";

// Contra Postgres real: lo que está bajo prueba es el upsert por tupla y que
// la tabla sea legible SIN tenant fijado — que es la parte inusual de esta
// tabla y la que una migración futura podría romper sin que nada más lo note.

let dbService: DbServiceType;
let repo: TrendsRepositoryType;

// Verticales inventadas para no chocar con filas reales del barrido.
const TUPLA: TuplaDeTendencias = {
  vertical: `spec_${randomUUID().slice(0, 8)}` as TuplaDeTendencias["vertical"],
  marketCountry: "MX",
  region: "sureste",
};

const ITEM: TrendItem = {
  topic: "Carruseles antes y después",
  signal: "rising",
  network: "instagram",
  format: "carrusel",
  blurb: "El formato lado a lado se está moviendo en cuentas de diseño.",
  sourceTitle: "ejemplo.mx",
  sourceUrl: "https://ejemplo.mx/tendencias",
};

const AHORA = new Date("2026-09-20T12:00:00.000Z");
const EN_UN_DIA = new Date("2026-09-21T12:00:00.000Z");

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual
  }
  const { DbService } = await import("../db/db.service.js");
  const { TrendsRepository } = await import("./trends.repository.js");
  dbService = new DbService();
  repo = new TrendsRepository();
}, 30_000);

afterAll(async () => {
  await dbService.db.delete(nicheTrends).where(eq(nicheTrends.vertical, TUPLA.vertical));
  await dbService.onModuleDestroy();
}, 30_000);

describe("TrendsRepository", () => {
  it("un segundo refresco actualiza la fila, no agrega otra", { timeout: 15_000 }, async () => {
    await dbService.db.transaction((tx) =>
      repo.upsert(tx, {
        ...TUPLA,
        items: [ITEM],
        generatedAt: AHORA,
        expiresAt: EN_UN_DIA,
        provider: "google",
        model: "spec",
        usage: {},
      }),
    );
    await dbService.db.transaction((tx) =>
      repo.upsert(tx, {
        ...TUPLA,
        items: [ITEM, { ...ITEM, topic: "Otra tendencia" }],
        generatedAt: EN_UN_DIA,
        expiresAt: new Date("2026-09-22T12:00:00.000Z"),
        provider: "google",
        model: "spec",
        usage: {},
      }),
    );

    const filas = await dbService.db
      .select()
      .from(nicheTrends)
      .where(
        and(
          eq(nicheTrends.vertical, TUPLA.vertical),
          eq(nicheTrends.marketCountry, TUPLA.marketCountry),
          eq(nicheTrends.region, TUPLA.region),
        ),
      );
    expect(filas).toHaveLength(1);
  });

  it("se lee desde dentro del tenant de un usuario cualquiera", { timeout: 15_000 }, async () => {
    // Es la propiedad que hace útil a la caché compartida: cualquier tenant ve
    // la misma fila. Si alguien le pusiera RLS a esta tabla, este test es el
    // que se entera — todo lo demás seguiría compilando y el usuario vería el
    // estado vacío sin motivo.
    const guardadas = await dbService.runWithTenant(randomUUID(), (tx) => repo.find(tx, TUPLA));
    expect(guardadas?.items).toHaveLength(2);
    expect(guardadas?.items[0]?.sourceUrl).toBe(ITEM.sourceUrl);
  });

  it("descarta los items guardados que ya no pasan el schema", { timeout: 15_000 }, async () => {
    // `items` es jsonb: el motor no garantiza su forma, así que una fila
    // escrita por una versión vieja del código no puede llegar a medias a la
    // pantalla.
    await dbService.db.transaction((tx) =>
      repo.upsert(tx, {
        ...TUPLA,
        items: [ITEM, { topic: "rota" } as unknown as TrendItem],
        generatedAt: AHORA,
        expiresAt: EN_UN_DIA,
        provider: "google",
        model: "spec",
        usage: {},
      }),
    );
    const guardadas = await dbService.db.transaction((tx) => repo.find(tx, TUPLA));
    expect(guardadas?.items).toHaveLength(1);
  });

  it("las vencidas vuelven igual, para poder mostrarlas con su fecha", async () => {
    // El camino de lectura prefiere tendencias de ayer fechadas que una
    // pantalla vacía mientras se refresca.
    await dbService.db.transaction((tx) =>
      repo.upsert(tx, {
        ...TUPLA,
        items: [ITEM],
        generatedAt: new Date("2026-09-01T12:00:00.000Z"),
        expiresAt: new Date("2026-09-02T12:00:00.000Z"),
        provider: "google",
        model: "spec",
        usage: {},
      }),
    );
    const guardadas = await dbService.db.transaction((tx) => repo.find(tx, TUPLA));
    expect(guardadas?.items).toHaveLength(1);
    expect(guardadas?.expiresAt.getTime()).toBeLessThan(AHORA.getTime());

    const pendientes = await dbService.db.transaction((tx) => repo.porRefrescar(tx, AHORA, 50));
    expect(pendientes.some((t) => t.vertical === TUPLA.vertical)).toBe(true);
  });
});
