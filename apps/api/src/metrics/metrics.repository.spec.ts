import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postMetrics, publicationCards, socialAccounts, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que cards.service.spec.ts (env.ts valida el entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type {
  MetricsRepository as MetricsRepositoryType,
  UpsertSnapshotInput,
} from "./metrics.repository.js";

// El upsert necesita Postgres real: lo que está bajo prueba es el índice
// único y el ON CONFLICT, no una función pura. Un mock de repo probaría que
// el mock funciona.

let dbService: DbServiceType;
let repo: MetricsRepositoryType;
let userA: string;

const BASE: Omit<UpsertSnapshotInput, "userId" | "platformPostId"> = {
  socialAccountId: null,
  network: "linkedin",
  cardId: null,
  snapshotDate: "2026-09-17",
  capturedAt: new Date("2026-09-17T06:00:00.000Z"),
  publishedAt: new Date("2026-09-16T18:00:00.000Z"),
  impressions: 84,
  reach: null,
  likes: 2,
  comments: 0,
  shares: 1,
  raw: { source: "test" },
  provider: "fake",
};

async function filasDe(platformPostId: string) {
  return dbService.runWithTenant(userA, (tx) =>
    tx.select().from(postMetrics).where(eq(postMetrics.platformPostId, platformPostId)),
  );
}

describe("MetricsRepository.upsertSnapshot", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual
    }
    const { DbService } = await import("../db/db.service.js");
    const { MetricsRepository } = await import("./metrics.repository.js");
    dbService = new DbService();
    repo = new MetricsRepository();

    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Métricas", email: `metrics-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    userA = user.id;
  }, 30_000);

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA]));
    await dbService.onModuleDestroy();
  }, 30_000);

  // El DoD de la fase, literal: "un segundo pase no duplica filas".
  it("un segundo pase el mismo día actualiza en vez de insertar", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId }),
    );
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        impressions: 210,
        likes: 9,
        capturedAt: new Date("2026-09-17T18:00:00.000Z"),
      }),
    );

    const filas = await filasDe(postId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.impressions).toBe(210);
    expect(filas[0]?.likes).toBe(9);
    expect(filas[0]?.capturedAt).toEqual(new Date("2026-09-17T18:00:00.000Z"));
  });

  // La contracara: si el upsert pisara siempre la misma fila, no habría serie
  // y "cuánto creció en las primeras 24 h" sería incontestable.
  it("otro día del mismo post es una fila nueva", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId }),
    );
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        snapshotDate: "2026-09-18",
        impressions: 300,
      }),
    );

    const filas = await filasDe(postId);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.snapshotDate).sort()).toEqual(["2026-09-17", "2026-09-18"]);
  });

  // Por esto la llave NO incluye social_account_id: reconectar una cuenta
  // crea una fila NUEVA en social_accounts, y con la cuenta en la llave el
  // mismo post del mismo día se guardaría dos veces.
  it("reconectar la cuenta no duplica el snapshot del día", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    const [cuentaVieja, cuentaNueva] = await dbService.runWithTenant(userA, (tx) =>
      tx
        .insert(socialAccounts)
        .values([
          { userId: userA, network: "linkedin", providerRef: `up_${randomUUID()}` },
          { userId: userA, network: "linkedin", providerRef: `up_${randomUUID()}` },
        ])
        .returning({ id: socialAccounts.id }),
    );
    if (!cuentaVieja || !cuentaNueva) throw new Error("No se pudieron crear las cuentas");

    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        socialAccountId: cuentaVieja.id,
      }),
    );
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        socialAccountId: cuentaNueva.id,
        impressions: 500,
      }),
    );

    const filas = await filasDe(postId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.impressions).toBe(500);
    // Y la fila queda apuntando a la conexión vigente, no a la muerta.
    expect(filas[0]?.socialAccountId).toBe(cuentaNueva.id);
  });

  // null no es 0: "la red no lo reportó" y "nadie lo vio" son hechos
  // distintos, y promediarlos juntos daría recomendaciones falsas en Ritmo.
  it("un null del proveedor se guarda como null, no como 0", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        reach: null,
        impressions: 0,
      }),
    );

    const filas = await filasDe(postId);
    expect(filas[0]?.reach).toBeNull();
    expect(filas[0]?.impressions).toBe(0);
  });

  // Una fila que entró sin card (backfill del historial previo del creator)
  // tiene que poder ganarla después, cuando esa publicación sí nazca en
  // Presencia o cuando se la pueda emparejar.
  it(
    "una fila sin card puede ganar card_id en un pase posterior",
    { timeout: 15_000 },
    async () => {
      const postId = `urn:li:share:${randomUUID()}`;
      await dbService.runWithTenant(userA, (tx) =>
        repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId, cardId: null }),
      );
      expect((await filasDe(postId))[0]?.cardId).toBeNull();

      const card = await dbService.runWithTenant(userA, async (tx) => {
        const [fila] = await tx
          .insert(publicationCards)
          .values({
            userId: userA,
            archetype: "text_first",
            network: "linkedin",
            content: { archetype: "text_first", body: "hola", hashtags: [], assetIds: [] },
          })
          .returning({ id: publicationCards.id });
        if (!fila) throw new Error("No se pudo crear la card de prueba");
        return fila.id;
      });
      await dbService.runWithTenant(userA, (tx) =>
        repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId, cardId: card }),
      );

      const filas = await filasDe(postId);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.cardId).toBe(card);
    },
  );
});
