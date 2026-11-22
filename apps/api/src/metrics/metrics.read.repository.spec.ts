import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chats, folders, postMetrics, publicationCards, users } from "../db/schema.js";
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

  it(
    "con dos mediciones a la misma distancia gana la posterior, siempre",
    { timeout: 15_000 },
    async () => {
      const postId = `fb-empate-${randomUUID()}`;
      // A las 21 h y a las 27 h: las dos a 3 h de la referencia. La de 21 h se
      // inserta primero para que, sin desempate, el orden físico la eligiera.
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 72,
        medidoTrasHoras: 21,
        likes: 40,
      });
      await sembrar({
        platformPostId: postId,
        publicadoHaceHoras: 72,
        medidoTrasHoras: 27,
        likes: 60,
      });

      const filas = await dbService.runWithTenant(userA, (tx) =>
        repo.postsComparables(tx, DESDE, AHORA),
      );
      expect(filas.find((fila) => fila.platformPostId === postId)?.likes).toBe(60);
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

describe("MetricsReadRepository.ultimosNumeros", () => {
  it(
    "toma el último número de cada métrica: un bucket nuevo en null no borra el anterior",
    { timeout: 15_000 },
    async () => {
      const postId = `ig-${randomUUID()}`;
      const publishedAt = new Date(AHORA.getTime() - 5 * 24 * HORA);
      const medicion = (horas: number) => new Date(publishedAt.getTime() + horas * HORA);
      const fila = (
        horas: number,
        numeros: Partial<Record<"reach" | "likes" | "comments", number>>,
      ) => ({
        userId: userA,
        socialAccountId: null,
        network: "instagram" as const,
        platformPostId: postId,
        cardId: null,
        snapshotAt: medicion(horas),
        capturedAt: medicion(horas),
        publishedAt,
        impressions: null,
        reach: numeros.reach ?? null,
        likes: numeros.likes ?? null,
        comments: numeros.comments ?? null,
        shares: null,
        raw: { source: "spec" },
        provider: "fake",
      });
      await dbService.runWithTenant(userA, (tx) =>
        tx.insert(postMetrics).values([
          fila(1, { reach: 100, likes: 5, comments: 2 }),
          fila(6, { likes: 8 }),
          // La última medición vino vacía: cuenta para "Medido hace", no
          // para los números.
          fila(24, {}),
        ]),
      );

      const [numeros] = await dbService.runWithTenant(userA, (tx) =>
        repo.ultimosNumeros(tx, { platformPostIds: [postId] }),
      );
      expect(numeros).toMatchObject({
        network: "instagram",
        platformPostId: postId,
        reach: 100,
        likes: 8,
        comments: 2,
        shares: null,
        impressions: null,
        snapshots: 3,
      });
      expect(numeros?.medidoEn?.getTime()).toBe(medicion(24).getTime());

      // Por fecha de publicación: entra con `desde` antes, no con `desde` después.
      const conDesde = await dbService.runWithTenant(userA, (tx) =>
        repo.ultimosNumeros(tx, { desde: new Date(publishedAt.getTime() - HORA) }),
      );
      expect(conDesde.some((f) => f.platformPostId === postId)).toBe(true);
      const despues = await dbService.runWithTenant(userA, (tx) =>
        repo.ultimosNumeros(tx, { desde: new Date(publishedAt.getTime() + HORA) }),
      );
      expect(despues.some((f) => f.platformPostId === postId)).toBe(false);
    },
  );
});

describe("MetricsReadRepository: publicaciones de Analíticas", () => {
  it("trae la carpeta del chat de origen", { timeout: 15_000 }, async () => {
    const publishedAt = new Date(AHORA.getTime() - 2 * 24 * HORA);
    const cardId = await dbService.runWithTenant(userA, async (tx) => {
      const [folder] = await tx
        .insert(folders)
        .values({ userId: userA, name: "Productividad", icon: "🧠" })
        .returning({ id: folders.id });
      const [chat] = await tx
        .insert(chats)
        .values({ userId: userA, folderId: folder?.id })
        .returning({ id: chats.id });
      const [card] = await tx
        .insert(publicationCards)
        .values({
          userId: userA,
          chatId: chat?.id,
          archetype: "text_first",
          network: "instagram",
          status: "published",
          content: { text: "con carpeta" },
          publishedAt,
        })
        .returning({ id: publicationCards.id });
      return card?.id;
    });

    const filas = await dbService.runWithTenant(userA, (tx) =>
      repo.publicacionesAnalizables(tx, new Date(publishedAt.getTime() - HORA), AHORA),
    );
    expect(filas.find((f) => f.cardId === cardId)?.carpeta).toEqual({
      nombre: "Productividad",
      icono: "🧠",
    });
  });

  it(
    "la familia de una card son sus hermanas publicadas, y una sin concepto va sola",
    { timeout: 15_000 },
    async () => {
      const groupId = randomUUID();
      const publishedAt = new Date(AHORA.getTime() - 4 * 24 * HORA);
      const base = {
        userId: userA,
        archetype: "text_first" as const,
        content: { text: "concepto" },
      };
      const ids = await dbService.runWithTenant(userA, async (tx) => {
        const filas = await tx
          .insert(publicationCards)
          .values([
            { ...base, network: "instagram", status: "published", groupId, publishedAt },
            { ...base, network: "facebook", status: "published", groupId, publishedAt },
            // Programada: es del concepto, pero todavía no es una publicación.
            { ...base, network: "linkedin", status: "scheduled", groupId },
            // Sin concepto: `group_id` null no la junta con las demás sin concepto.
            { ...base, network: "instagram", status: "published", publishedAt },
          ])
          .returning({ id: publicationCards.id });
        return filas.map((f) => f.id);
      });

      const familia = await dbService.runWithTenant(userA, (tx) =>
        repo.publicacionYHermanas(tx, ids[0] ?? ""),
      );
      expect(familia.map((f) => f.network).sort()).toEqual(["facebook", "instagram"]);

      const sola = await dbService.runWithTenant(userA, (tx) =>
        repo.publicacionYHermanas(tx, ids[3] ?? ""),
      );
      expect(sola.map((f) => f.cardId)).toEqual([ids[3]]);
    },
  );
});
