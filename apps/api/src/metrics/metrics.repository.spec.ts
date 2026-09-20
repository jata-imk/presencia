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
  snapshotAt: new Date("2026-09-17T00:00:00.000Z"),
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
  it(
    "un segundo pase del mismo bucket actualiza en vez de insertar",
    { timeout: 15_000 },
    async () => {
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
    },
  );

  // La contracara: si el upsert pisara siempre la misma fila, no habría serie
  // y "cuánto creció en las primeras 24 h" sería incontestable.
  it("otro bucket del mismo post es una fila nueva", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId }),
    );
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        snapshotAt: new Date("2026-09-18T00:00:00.000Z"),
        impressions: 300,
      }),
    );

    const filas = await filasDe(postId);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.snapshotAt.toISOString()).sort()).toEqual([
      "2026-09-17T00:00:00.000Z",
      "2026-09-18T00:00:00.000Z",
    ]);
  });

  // Por esto la llave NO incluye social_account_id. Reconectar normalmente
  // REUTILIZA la fila (ChannelsService.claimConnectIntent captura la violación
  // de unicidad de provider_ref y llama a reactivateAccount), pero borrar la
  // cuenta y volver a conectarla sí crea una fila nueva — y con la cuenta en
  // la llave, el mismo post del mismo día se guardaría dos veces. Este test
  // reproduce ESE camino: misma cuenta de la red, fila distinta.
  it(
    "una cuenta borrada y reconectada no duplica el snapshot del día",
    { timeout: 15_000 },
    async () => {
      const postId = `urn:li:share:${randomUUID()}`;
      // El mismo provider_ref: su índice único global obliga a que la
      // reconexión sea borrar-e-insertar, no dos cuentas coexistiendo.
      const providerRef = `up_${randomUUID()}`;
      const cuentaVieja = await dbService.runWithTenant(userA, async (tx) => {
        const [fila] = await tx
          .insert(socialAccounts)
          .values({ userId: userA, network: "linkedin", providerRef })
          .returning({ id: socialAccounts.id });
        if (!fila) throw new Error("No se pudo crear la cuenta");
        return fila;
      });

      await dbService.runWithTenant(userA, (tx) =>
        repo.upsertSnapshot(tx, {
          ...BASE,
          userId: userA,
          platformPostId: postId,
          socialAccountId: cuentaVieja.id,
        }),
      );

      const cuentaNueva = await dbService.runWithTenant(userA, async (tx) => {
        await tx.delete(socialAccounts).where(eq(socialAccounts.id, cuentaVieja.id));
        const [fila] = await tx
          .insert(socialAccounts)
          .values({ userId: userA, network: "linkedin", providerRef })
          .returning({ id: socialAccounts.id });
        if (!fila) throw new Error("No se pudo reconectar la cuenta");
        return fila;
      });
      expect(cuentaNueva.id).not.toBe(cuentaVieja.id);

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
      // Y la fila queda apuntando a la conexión vigente. El borrado de la
      // vieja ya la había dejado en null por el SET NULL del FK; lo que este
      // test cuida es que no haya DOS filas.
      expect(filas[0]?.socialAccountId).toBe(cuentaNueva.id);
    },
  );

  // El caso que ADR-021 llama la norma: "publicó pero la red no dio números".
  // Un pase que falla después de uno que funcionó llega con todo en null, y el
  // índice único lo convierte en UPDATE. Sin la guardia, ese UPDATE borra el
  // único dato bueno del día y no hay de dónde recuperarlo: era un snapshot,
  // el proveedor ya no lo tiene.
  it("un pase sin métricas no borra las del pase anterior", { timeout: 15_000 }, async () => {
    const postId = `urn:li:share:${randomUUID()}`;
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, { ...BASE, userId: userA, platformPostId: postId }),
    );
    await dbService.runWithTenant(userA, (tx) =>
      repo.upsertSnapshot(tx, {
        ...BASE,
        userId: userA,
        platformPostId: postId,
        impressions: null,
        likes: null,
        comments: null,
        shares: null,
        publishedAt: null,
        capturedAt: new Date("2026-09-17T18:00:00.000Z"),
        raw: { post_metrics_error: "LinkedIn post metrics are only available for Pages" },
      }),
    );

    const filas = await filasDe(postId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.impressions).toBe(84);
    expect(filas[0]?.likes).toBe(2);
    expect(filas[0]?.publishedAt).toEqual(new Date("2026-09-16T18:00:00.000Z"));
    // Lo que SÍ se pisa: el motivo del último intento y cuándo se intentó.
    expect(filas[0]?.raw).toEqual({
      post_metrics_error: "LinkedIn post metrics are only available for Pages",
    });
    expect(filas[0]?.capturedAt).toEqual(new Date("2026-09-17T18:00:00.000Z"));
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
