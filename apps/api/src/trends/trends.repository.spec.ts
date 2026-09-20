import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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
// la tabla sea legible SIN tenant fijado — la parte inusual de esta tabla, y
// la que una migración futura podría romper sin que nada más lo note.

let dbService: DbServiceType;
let repo: TrendsRepositoryType;

// Cada test usa su propia región para no depender del orden ni del estado que
// dejó el anterior. Con estado compartido, un `--shuffle` o un `.only`
// producía fallos que apuntaban al lugar equivocado.
const REGIONES_USADAS: string[] = [];
function tuplaNueva(region: TuplaDeTendencias["region"] = "sureste"): TuplaDeTendencias {
  const vertical = `spec_${randomUUID().slice(0, 8)}`;
  REGIONES_USADAS.push(vertical);
  return { vertical: vertical as TuplaDeTendencias["vertical"], marketCountry: "MX", region };
}

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

function guardar(
  tupla: TuplaDeTendencias,
  items: TrendItem[],
  expiresAt: Date,
  generatedAt = AHORA,
) {
  return dbService.db.transaction((tx) =>
    repo.upsert(tx, {
      ...tupla,
      items,
      generatedAt,
      expiresAt,
      provider: "google",
      model: "spec",
      usage: {},
    }),
  );
}

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

// La tupla del test de posponer usa una vertical REAL, porque probar el
// posponer con una vertical inventada pasaría por el motivo equivocado: el
// filtro del barrido la descartaría antes y la aserción no diría nada.
const TUPLA_REAL: TuplaDeTendencias = {
  vertical: "parenting",
  marketCountry: "SPEC",
  region: "noroeste",
};

afterAll(async () => {
  if (REGIONES_USADAS.length > 0) {
    await dbService.db.delete(nicheTrends).where(inArray(nicheTrends.vertical, REGIONES_USADAS));
  }
  await dbService.db.delete(nicheTrends).where(eq(nicheTrends.marketCountry, "SPEC"));
  await dbService.onModuleDestroy();
}, 30_000);

describe("TrendsRepository", () => {
  it("un segundo refresco actualiza la fila, no agrega otra", { timeout: 15_000 }, async () => {
    const tupla = tuplaNueva();
    await guardar(tupla, [ITEM], EN_UN_DIA);
    await guardar(tupla, [ITEM, { ...ITEM, topic: "Otra tendencia" }], EN_UN_DIA);

    const filas = await dbService.db
      .select()
      .from(nicheTrends)
      .where(
        and(
          eq(nicheTrends.vertical, tupla.vertical),
          eq(nicheTrends.marketCountry, tupla.marketCountry),
          eq(nicheTrends.region, tupla.region),
        ),
      );
    expect(filas).toHaveLength(1);
  });

  it("se lee desde dentro del tenant de un usuario cualquiera", { timeout: 15_000 }, async () => {
    // Es la propiedad que hace útil a la caché compartida: cualquier tenant ve
    // la misma fila. Si alguien le pusiera RLS a esta tabla, este test es el
    // que se entera — todo lo demás seguiría compilando y el usuario vería el
    // estado vacío sin motivo.
    const tupla = tuplaNueva();
    await guardar(tupla, [ITEM], EN_UN_DIA);

    const guardadas = await dbService.runWithTenant(randomUUID(), (tx) => repo.find(tx, tupla));
    expect(guardadas?.items).toHaveLength(1);
    expect(guardadas?.items[0]?.sourceUrl).toBe(ITEM.sourceUrl);
  });

  it("descarta los items guardados que ya no pasan el schema", { timeout: 15_000 }, async () => {
    // `items` es jsonb: el motor no garantiza su forma, así que una fila
    // escrita por una versión vieja del código no puede llegar a medias a la
    // pantalla.
    const tupla = tuplaNueva();
    await guardar(tupla, [ITEM, { topic: "rota" } as unknown as TrendItem], EN_UN_DIA);

    const guardadas = await dbService.db.transaction((tx) => repo.find(tx, tupla));
    expect(guardadas?.items).toHaveLength(1);
  });

  it("las vencidas vuelven igual, para poder mostrarlas con su fecha", async () => {
    // El camino de lectura prefiere tendencias de ayer fechadas que una
    // pantalla vacía mientras se refresca.
    const tupla = tuplaNueva();
    await guardar(tupla, [ITEM], new Date("2026-09-02T12:00:00.000Z"));

    const guardadas = await dbService.db.transaction((tx) => repo.find(tx, tupla));
    expect(guardadas?.items).toHaveLength(1);
    expect(guardadas?.expiresAt.getTime()).toBeLessThan(AHORA.getTime());
  });

  it("posponer mueve el vencimiento sin tocar las tendencias", { timeout: 15_000 }, async () => {
    // Es lo que impide que una tupla improductiva acapare el pase: conserva la
    // fecha más vieja de la tabla y vuelve a salir primera cada vez. Y los
    // items se quedan, para que el usuario siga viendo su última tanda buena.
    const tupla = TUPLA_REAL;
    await guardar(tupla, [ITEM], new Date("2026-09-02T12:00:00.000Z"));

    // Vencida: el barrido la ve.
    const corte = new Date("2026-09-20T12:00:00.000Z");
    const antes = await dbService.db.transaction((tx) => repo.porRefrescar(tx, corte, 500));
    expect(antes.some((t) => t.marketCountry === "SPEC")).toBe(true);

    const despues = new Date("2026-09-30T12:00:00.000Z");
    await dbService.db.transaction((tx) => repo.posponer(tx, tupla, despues));

    const guardadas = await dbService.db.transaction((tx) => repo.find(tx, tupla));
    expect(guardadas?.expiresAt.getTime()).toBe(despues.getTime());
    // Los items siguen ahí: el usuario conserva su última tanda buena.
    expect(guardadas?.items).toHaveLength(1);

    // Y ya no sale en el barrido, que es lo que le devuelve el lugar a las
    // tuplas sanas.
    const pendientes = await dbService.db.transaction((tx) => repo.porRefrescar(tx, corte, 500));
    expect(pendientes.some((t) => t.marketCountry === "SPEC")).toBe(false);
  });

  it("el barrido ignora las filas cuya vertical ya no existe", { timeout: 15_000 }, async () => {
    // Las columnas son `text` para que guardar nunca truene, pero lo que sale
    // de acá se convierte en el nicho del prompt de búsqueda: una vertical
    // retirada mandaría al job a buscar tendencias de algo inexistente, cada
    // pase. Es también lo que protege a la DB de dev de las filas que deja
    // este mismo spec si se interrumpe.
    const tupla = tuplaNueva();
    await guardar(tupla, [ITEM], new Date("2026-09-02T12:00:00.000Z"));

    const pendientes = await dbService.db.transaction((tx) =>
      repo.porRefrescar(tx, new Date("2026-09-20T12:00:00.000Z"), 200),
    );
    expect(pendientes.some((t) => t.vertical === tupla.vertical)).toBe(false);
  });
});
