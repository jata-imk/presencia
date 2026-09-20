import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { postMetrics, publicationCards, socialAccounts, users } from "../db/schema.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
import type { PostMetricsQuery, PostMetricsSnapshot } from "../publishing/publishing.provider.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que cards.service.spec.ts (env.ts valida el entorno al importar).
import type { CardsRepository as CardsRepositoryType } from "../cards/cards.repository.js";
import type { ChannelsRepository as ChannelsRepositoryType } from "../channels/channels.repository.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { MetricsRepository as MetricsRepositoryType } from "./metrics.repository.js";
import type { MetricsService as MetricsServiceType } from "./metrics.service.js";

// El pase necesita Postgres real: lo que se prueba es el recorrido completo
// —barrido global, lectura por tenant, escritura con RLS y el upsert— y eso no
// lo ejercita un mock de repositorio.
//
// OJO: `ingestAll` es GLOBAL, así que ve también las cards de otros specs
// corriendo contra la misma base. Todas las aserciones son sobre las filas del
// usuario de este spec.

let dbService: DbServiceType;
let cardsRepo: CardsRepositoryType;
let channelsRepo: ChannelsRepositoryType;
let metricsRepo: MetricsRepositoryType;
let MetricsServiceCtor: new (
  dbService: DbServiceType,
  cardsRepo: CardsRepositoryType,
  channelsRepo: ChannelsRepositoryType,
  repo: MetricsRepositoryType,
  provider: FakePublishingProvider,
) => MetricsServiceType;
let service: MetricsServiceType;
let provider: ProviderFijo;
let userA: string;
let accountA: string;

/** Números fijos, para poder afirmar sobre ellos; y guarda los lotes pedidos. */
class ProviderFijo extends FakePublishingProvider {
  readonly lotes: PostMetricsQuery[][] = [];
  override getPostMetrics(
    posts: readonly PostMetricsQuery[],
  ): Promise<Map<string, PostMetricsSnapshot>> {
    this.lotes.push([...posts]);
    const result = new Map<string, PostMetricsSnapshot>();
    for (const post of posts) {
      result.set(post.platformPostId, {
        capturedAt: new Date(),
        impressions: 84,
        reach: null,
        likes: 2,
        comments: 0,
        shares: 1,
        raw: { fijo: true },
      });
    }
    return Promise.resolve(result);
  }
}

async function nuevaCardPublicada(platformPostId: string, publishedAt: Date): Promise<string> {
  return dbService.runWithTenant(userA, async (tx) => {
    const [card] = await tx
      .insert(publicationCards)
      .values({
        userId: userA,
        archetype: "text_first",
        network: "facebook",
        status: "published",
        content: { archetype: "text_first", body: "hola", hashtags: [], assetIds: [] },
        socialAccountId: accountA,
        providerRef: `job_${randomUUID()}`,
        platformPostId,
        publishedAt,
      })
      .returning({ id: publicationCards.id });
    if (!card) throw new Error("No se pudo crear la card de prueba");
    return card.id;
  });
}

async function metricasDe(platformPostId: string) {
  return dbService.runWithTenant(userA, (tx) =>
    tx.select().from(postMetrics).where(eq(postMetrics.platformPostId, platformPostId)),
  );
}

describe("MetricsService.ingestAll", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");
    const { ChannelsRepository } = await import("../channels/channels.repository.js");
    const { MetricsRepository } = await import("./metrics.repository.js");
    const { MetricsService } = await import("./metrics.service.js");
    dbService = new DbService();
    cardsRepo = new CardsRepository();
    channelsRepo = new ChannelsRepository();
    metricsRepo = new MetricsRepository();
    MetricsServiceCtor = MetricsService;

    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Ingesta", email: `ingesta-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    userA = user.id;

    accountA = await dbService.runWithTenant(userA, async (tx) => {
      const [cuenta] = await tx
        .insert(socialAccounts)
        .values({
          userId: userA,
          network: "facebook",
          providerRef: `presencia-${randomUUID()}:facebook`,
        })
        .returning({ id: socialAccounts.id });
      if (!cuenta) throw new Error("No se pudo crear la cuenta de prueba");
      return cuenta.id;
    });
  }, 30_000);

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA]));
    await dbService.onModuleDestroy();
  }, 30_000);

  beforeEach(() => {
    provider = new ProviderFijo();
    service = new MetricsServiceCtor(dbService, cardsRepo, channelsRepo, metricsRepo, provider);
  });

  it("escribe un snapshot de cada card publicada", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    await nuevaCardPublicada(postId, new Date(Date.now() - 60 * 60 * 1000));

    await service.ingestAll();

    const filas = await metricasDe(postId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.impressions).toBe(84);
    // `null` y no 0: el proveedor no reportó reach (ADR-021).
    expect(filas[0]?.reach).toBeNull();
    expect(filas[0]?.network).toBe("facebook");
    expect(filas[0]?.cardId).not.toBeNull();
  });

  // El DoD de la fase, de punta a punta y no solo en el repositorio.
  it("un segundo pase el mismo día no duplica filas", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    await nuevaCardPublicada(postId, new Date(Date.now() - 60 * 60 * 1000));

    await service.ingestAll();
    await service.ingestAll();

    expect(await metricasDe(postId)).toHaveLength(1);
  });

  // La política de frescura corta antes de gastar red, no después de traerla.
  it("no le pregunta al proveedor por un post ya medido hoy", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    // Diez días: fuera del tramo "cada pase", dentro del "una vez al día".
    await nuevaCardPublicada(postId, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));

    await service.ingestAll();
    const lotesPrimerPase = provider.lotes.length;
    await service.ingestAll();

    const pedidoDeNuevo = provider.lotes
      .slice(lotesPrimerPase)
      .some((lote) => lote.some((post) => post.platformPostId === postId));
    expect(pedidoDeNuevo).toBe(false);
  });

  // Una card cuya cuenta se borró queda sin `social_account_id` (SET NULL): no
  // hay perfil que pasarle al proveedor, así que no se pregunta. Inventar un
  // destino sería peor que no medir.
  it("una card sin cuenta no se pregunta", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    const cardId = await nuevaCardPublicada(postId, new Date(Date.now() - 60 * 60 * 1000));
    await dbService.runWithTenant(userA, (tx) =>
      tx
        .update(publicationCards)
        .set({ socialAccountId: null })
        .where(eq(publicationCards.id, cardId)),
    );

    await service.ingestAll();

    expect(await metricasDe(postId)).toHaveLength(0);
  });

  // Fuera de la ventana no se mide: el barrido tiene que quedar acotado a un
  // conjunto que no crezca para siempre.
  it("una publicación de hace más de 30 días no se mide", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    await nuevaCardPublicada(postId, new Date(Date.now() - 32 * 24 * 60 * 60 * 1000));

    await service.ingestAll();

    expect(await metricasDe(postId)).toHaveLength(0);
  });

  // El pase es global: un usuario que truena no puede dejar sin medir a los
  // demás, y el job tiene que quedar marcado como fallido nombrándolo.
  it("un usuario que falla no tumba el pase, pero sí lo reporta", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    await nuevaCardPublicada(postId, new Date(Date.now() - 60 * 60 * 1000));

    const roto = new ProviderFijo();
    roto.getPostMetrics = () => Promise.reject(new Error("proveedor caído"));
    const servicioRoto = new MetricsServiceCtor(
      dbService,
      cardsRepo,
      channelsRepo,
      metricsRepo,
      roto,
    );

    await expect(servicioRoto.ingestAll()).rejects.toThrow(/ingesta de métricas/i);
    expect(await metricasDe(postId)).toHaveLength(0);
  });
});
