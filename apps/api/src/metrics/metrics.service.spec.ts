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
// OJO: `ingestAll` es GLOBAL, así que ve también las cards de OTROS usuarios de
// la base — y la de dev es la del VPS, con los datos reales de Jose. Por eso
// `ProviderFijo` solo contesta por los posts que este spec registró: con un
// proveedor que contestara por todos, correr la suite le inyectaría métricas
// inventadas a tenants reales, y ahí se quedarían (el upsert conserva lo no
// nulo, así que un pase posterior no las corrige).
//
// Las aserciones, además, son siempre sobre las filas del usuario del spec.

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

// Instante fijo para los casos que dependen del bucket. Un post de una hora
// vive en el tramo horario de la escalera, así que sin congelar el reloj el
// resultado cambiaría según el minuto en que corra la suite.
const AHORA = new Date("2026-09-20T09:30:00.000Z");

/**
 * Números fijos, para poder afirmar sobre ellos; y guarda los lotes pedidos.
 *
 * Contesta SOLO por los posts que el spec registró en `mios`. Todo lo demás
 * queda ausente del Map, que es un resultado legítimo del puerto ("no se
 * llegó a preguntar") y deja intactos los datos de los otros tenants.
 */
class ProviderFijo extends FakePublishingProvider {
  readonly lotes: PostMetricsQuery[][] = [];
  static readonly mios = new Set<string>();
  override getPostMetrics(
    posts: readonly PostMetricsQuery[],
  ): Promise<Map<string, PostMetricsSnapshot>> {
    this.lotes.push([...posts]);
    const result = new Map<string, PostMetricsSnapshot>();
    for (const post of posts) {
      if (!ProviderFijo.mios.has(post.platformPostId)) continue;
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
  ProviderFijo.mios.add(platformPostId);
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
    await nuevaCardPublicada(postId, new Date(AHORA.getTime() - 60 * 60 * 1000));

    await service.ingestAll({ ahora: AHORA });

    const filas = await metricasDe(postId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.impressions).toBe(84);
    // `null` y no 0: el proveedor no reportó reach (ADR-021).
    expect(filas[0]?.reach).toBeNull();
    expect(filas[0]?.network).toBe("facebook");
    expect(filas[0]?.cardId).not.toBeNull();
    // Un post de una hora vive en el tramo horario de la escalera, así que su
    // fila se llavea por la hora en curso — no por el día. Es lo que hace que
    // la serie de las primeras 12 h tenga 12 puntos y no uno.
    expect(filas[0]?.snapshotAt).toEqual(new Date("2026-09-20T09:00:00.000Z"));
  });

  // El DoD de la fase, de punta a punta y no solo en el repositorio.
  it("un segundo pase del mismo bucket no duplica filas", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    await nuevaCardPublicada(postId, new Date(AHORA.getTime() - 60 * 60 * 1000));

    // El mismo instante en los dos pases: con `new Date()` real, dos pases
    // que cruzaran el borde de la hora caerían en buckets distintos y el test
    // fallaría por el reloj, no por el código.
    await service.ingestAll({ ahora: AHORA });
    await service.ingestAll({ ahora: AHORA });

    expect(await metricasDe(postId)).toHaveLength(1);
  });

  // La política de frescura corta antes de gastar red, no después de traerla.
  it("no le pregunta al proveedor por un post ya medido hoy", { timeout: 30_000 }, async () => {
    const postId = `fb_${randomUUID()}`;
    // Diez días: su bucket es el día entero, así que el segundo pase de la
    // misma jornada no tiene punto nuevo que guardar y no toca la red.
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

  // El tope del adapter es por LLAMADA, y getPostMetrics se llama una vez por
  // usuario: sin un presupuesto del pase, N usuarios harían N×60 requests
  // contra la ventana de 100/5min que comparte con cards.reconcile.
  it("el presupuesto del pase recorta, y deja lo más nuevo", { timeout: 90_000 }, async () => {
    const viejo = `fb_${randomUUID()}`;
    const medio = `fb_${randomUUID()}`;
    const nuevo = `fb_${randomUUID()}`;
    const dia = 24 * 60 * 60 * 1000;
    // Los tres fuera del tramo "cada pase" para que el orden lo decida la
    // prioridad y no la política de frescura.
    await nuevaCardPublicada(viejo, new Date(Date.now() - 12 * dia));
    await nuevaCardPublicada(medio, new Date(Date.now() - 8 * dia));
    await nuevaCardPublicada(nuevo, new Date(Date.now() - 4 * dia));

    // El presupuesto del pase se reparte entre TODOS los usuarios con algo que
    // medir, y esta base tiene varios: que al usuario del spec le toque en un
    // pase dado depende del barajado. Por eso se repite hasta que le toque en
    // vez de afirmar sobre un solo pase — así era antes, y el test pasaba o
    // fallaba por suerte (hizo fallar CI en un PR que no tocaba métricas).
    //
    // Repetir también ejercita la equidad: si el barajado no reparte —como
    // pasaba con `sort(() => Math.random() - 0.5)`, que deja el orden casi
    // intacto— al mismo usuario no le toca nunca y esto se agota.
    let tocó = false;
    for (let intento = 0; intento < 6 && !tocó; intento += 1) {
      await service.ingestAll({ presupuesto: 2 });
      tocó = (await metricasDe(nuevo)).length > 0 || (await metricasDe(medio)).length > 0;
    }
    expect(tocó, "en seis pases el barajado nunca le dio presupuesto a este usuario").toBe(true);

    // La query del barrido no ordena y el índice parcial la sirve por
    // published_at ascendente: sin la prioridad explícita, el recorte se
    // comería siempre las publicaciones recientes, que son justo las que
    // todavía se mueven y cuya primera medición no se recupera después.
    //
    // La afirmación es de ORDEN y no de conteo: cuántos entran depende de
    // cuántos tenants compitan, cuál entra primero no.
    const nuevoMedido = (await metricasDe(nuevo)).length > 0;
    const medioMedido = (await metricasDe(medio)).length > 0;
    const viejoMedido = (await metricasDe(viejo)).length > 0;
    expect(nuevoMedido).toBe(true);
    expect(medioMedido && !nuevoMedido).toBe(false);
    expect(viejoMedido && !medioMedido).toBe(false);
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
