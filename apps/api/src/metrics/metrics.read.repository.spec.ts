import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postMetrics, publicationCards, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que metrics.repository.spec.ts (env.ts valida el entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { MetricsReadRepository as MetricsReadRepositoryType } from "./metrics.read.repository.js";

// Estas queries necesitan Postgres real: lo que está bajo prueba es el filtro
// de tolerancia y la elección del snapshot comparable, que viven en SQL. Un
// repositorio falso probaría el repositorio falso.

let dbService: DbServiceType;
let repo: MetricsReadRepositoryType;
let userA: string;

const HORA = 60 * 60 * 1000;
const AHORA = new Date("2026-09-20T12:00:00.000Z");
const DESDE = new Date(AHORA.getTime() - 30 * 24 * HORA);

/** Publicado hace `horas`, medido `horasTrasPublicar` después de publicarse. */
async function sembrar(opciones: {
  platformPostId: string;
  publicadoHaceHoras: number;
  medidoTrasHoras: number;
  likes?: number | null;
}) {
  const publishedAt = new Date(AHORA.getTime() - opciones.publicadoHaceHoras * HORA);
  const capturedAt = new Date(publishedAt.getTime() + opciones.medidoTrasHoras * HORA);
  await dbService.runWithTenant(userA, (tx) =>
    tx.insert(postMetrics).values({
      userId: userA,
      socialAccountId: null,
      network: "facebook",
      platformPostId: opciones.platformPostId,
      cardId: null,
      // El bucket real lo calcula frescura.ts; acá basta con que sea único
      // por medición, que es lo que exige el índice.
      snapshotAt: capturedAt,
      capturedAt,
      publishedAt,
      impressions: null,
      reach: null,
      likes: opciones.likes === undefined ? 10 : opciones.likes,
      comments: null,
      shares: null,
      raw: { source: "spec" },
      provider: "fake",
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
  const { MetricsReadRepository } = await import("./metrics.read.repository.js");
  dbService = new DbService();
  repo = new MetricsReadRepository();

  const [user] = await dbService.db
    .insert(users)
    .values({ name: "Motor", email: `motor-${randomUUID()}@test.local` })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario de prueba");
  userA = user.id;
}, 30_000);

// El borrado en cascada de `users` se lleva sus post_metrics y sus cards.
afterAll(async () => {
  await dbService.db.delete(users).where(inArray(users.id, [userA]));
  await dbService.onModuleDestroy();
}, 30_000);

describe("MetricsReadRepository.postsComparables", () => {
  it(
    "elige el snapshot más cercano a las 24 h y descarta los demás",
    { timeout: 15_000 },
    async () => {
      const postId = `fb-${randomUUID()}`;
      // Tres mediciones del mismo post: a las 2 h, a las 20 h y a las 26 h.
      // Solo una es la comparable, y no es la más reciente.
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 72,
        medidoTrasHoras: 2,
        likes: 1,
      });
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 72,
        medidoTrasHoras: 20,
        likes: 50,
      });
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 72,
        medidoTrasHoras: 26,
        likes: 99,
      });

      const filas = await dbService.runWithTenant(userA, (tx) =>
        repo.postsComparables(tx, DESDE, AHORA),
      );
      const mio = filas.filter((fila) => fila.platformPostId === postId);
      expect(mio).toHaveLength(1);
      // 26 h está a 2 h de la referencia; 20 h está a 4. Gana el de 26.
      expect(mio[0]?.likes).toBe(99);
    },
  );

  it("un post que no ha cumplido la edad de referencia no entra", { timeout: 15_000 }, async () => {
    const postId = `fb-joven-${randomUUID()}`;
    // Publicado hace 2 h y medido de inmediato: existe, pero todavía está
    // acumulando. Contarlo castigaría a su hora por ser reciente.
    await sembrar({ platformPostId: postId, publicadoHaceHoras: 2, medidoTrasHoras: 1 });

    const filas = await dbService.runWithTenant(userA, (tx) =>
      repo.postsComparables(tx, DESDE, AHORA),
    );
    expect(filas.some((fila) => fila.platformPostId === postId)).toBe(false);
  });

  it(
    "un post medido fuera de la tolerancia queda fuera aunque exista",
    { timeout: 15_000 },
    async () => {
      const postId = `fb-hueco-${randomUUID()}`;
      // La ingesta se saltó el tramo (worker caído) y el único snapshot es de
      // los 8 días. Compararlo con los de 24 h inflaría su franja.
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 10 * 24,
        medidoTrasHoras: 8 * 24,
      });

      const filas = await dbService.runWithTenant(userA, (tx) =>
        repo.postsComparables(tx, DESDE, AHORA),
      );
      expect(filas.some((fila) => fila.platformPostId === postId)).toBe(false);
    },
  );

  it("un post sin ningún número sí vuelve", { timeout: 15_000 }, async () => {
    // "La red no reportó" es un hecho que el motor necesita para distinguir
    // no_reporta de cold. Filtrarlo acá volvería esos dos casos iguales.
    const postId = `fb-mudo-${randomUUID()}`;
    await sembrar({
      platformPostId: postId,
      publicadoHaceHoras: 48,
      medidoTrasHoras: 24,
      likes: null,
    });

    const filas = await dbService.runWithTenant(userA, (tx) =>
      repo.postsComparables(tx, DESDE, AHORA),
    );
    const mio = filas.find((fila) => fila.platformPostId === postId);
    expect(mio).toBeDefined();
    expect(mio?.likes).toBeNull();
  });
});

describe("MetricsReadRepository.publicacionesPublicadas", () => {
  it("solo cuenta las publicadas, no las programadas", { timeout: 15_000 }, async () => {
    const publicada = new Date(AHORA.getTime() - 3 * 24 * HORA);
    await dbService.runWithTenant(userA, (tx) =>
      tx.insert(publicationCards).values([
        {
          userId: userA,
          archetype: "text_first",
          network: "facebook",
          status: "published",
          content: { text: "ya salió" },
          publishedAt: publicada,
        },
        {
          userId: userA,
          archetype: "text_first",
          network: "facebook",
          status: "scheduled",
          content: { text: "todavía no" },
          scheduledAt: new Date(AHORA.getTime() + 24 * HORA),
        },
      ]),
    );

    const filas = await dbService.runWithTenant(userA, (tx) =>
      repo.publicacionesPublicadas(tx, DESDE, AHORA),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]?.publishedAt.getTime()).toBe(publicada.getTime());
  });
});
