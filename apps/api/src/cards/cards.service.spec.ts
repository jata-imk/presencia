import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { chats, folders, users } from "../db/schema.js";
import { PublishingRejectedError, PublishingUnavailableError } from "../publishing/errors.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
import type { SchedulePostRequest } from "../publishing/publishing.provider.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que credits.service.spec.ts / channels.service.spec.ts.
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { ChannelsRepository as ChannelsRepositoryType } from "../channels/channels.repository.js";
import type { CardsRepository as CardsRepositoryType } from "./cards.repository.js";
import type { CardsService as CardsServiceType } from "./cards.service.js";

// El ciclo de vida (CardsService.schedule/cancelSchedule/reconcileDueCards)
// necesita Postgres real: runWithTenant, RLS y el orden de dos transacciones
// (markScheduling → llamada al proveedor → attachProviderRef) son el
// comportamiento bajo prueba, no algo que un mock de repo ejercite de verdad.

let dbService: DbServiceType;
let cardsRepo: CardsRepositoryType;
let channelsRepo: ChannelsRepositoryType;
let CardsServiceCtor: new (
  dbService: DbServiceType,
  cardsRepo: CardsRepositoryType,
  channelsRepo: ChannelsRepositoryType,
  provider: FakePublishingProvider,
) => CardsServiceType;
let service: CardsServiceType;
let provider: FakePublishingProvider;
let userA: string;
let userB: string;
let chatA: string;

const TEXT_CONTENT: CardContent = {
  archetype: "text_first",
  body: "Cinco hábitos que cambiaron mi productividad.",
  hashtags: [],
  assetIds: [],
};

const VISUAL_CONTENT_NO_MEDIA: CardContent = {
  archetype: "visual_first",
  caption: "El error que cometí al construir mi marca personal.",
  hashtags: [],
  assetIds: [],
};

const VISUAL_CONTENT_WITH_MEDIA: CardContent = {
  ...VISUAL_CONTENT_NO_MEDIA,
  assetIds: [randomUUID()],
};

const VIDEO_CONTENT_NO_MEDIA: CardContent = {
  archetype: "video_script",
  hook: "Llevo 3 años creando contenido y este es el error que más dinero me costó.",
  script: "Guion completo del video.",
  caption: "El error que cometí.",
  hashtags: [],
  assetIds: [],
};

const VIDEO_CONTENT_WITH_MEDIA: CardContent = {
  ...VIDEO_CONTENT_NO_MEDIA,
  assetIds: [randomUUID()],
};

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

// Providers de prueba que fuerzan cada rama de classifyScheduleFailure en
// cards.service.ts — el fake normal (fake.provider.ts) siempre tiene éxito,
// así que necesitamos subclasificarlo para simular las dos formas de
// fallo que schedule() debe tratar distinto (rejected → draft, sin dudar;
// ambiguous → failed, conservando el rastro). Subclases in-file, no
// cambios a fake.provider.ts: ese archivo es el provider real de dev/test,
// no debe mentir sobre fallos que nunca simula por sí solo.
class RejectingProvider extends FakePublishingProvider {
  override schedule(): Promise<{ providerRef: string }> {
    return Promise.reject(new PublishingRejectedError("socialMediaId inválido", { status: 400 }));
  }
}

class AmbiguousProvider extends FakePublishingProvider {
  override schedule(): Promise<{ providerRef: string }> {
    return Promise.reject(
      new PublishingUnavailableError("PostFast no devolvió el id del post programado.", {
        reason: "no_id_in_response",
        body: { ok: true },
      }),
    );
  }
}

class FlakyProvider extends FakePublishingProvider {
  private failNext = true;
  override schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(
        new PublishingUnavailableError("PostFast no devolvió el id del post programado.", {
          reason: "no_id_in_response",
          body: {},
        }),
      );
    }
    return super.schedule(req);
  }
}

describe("CardsService", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("./cards.repository.js");
    const { ChannelsRepository } = await import("../channels/channels.repository.js");
    ({ CardsService: CardsServiceCtor } = await import("./cards.service.js"));

    dbService = new DbService();
    cardsRepo = new CardsRepository();
    channelsRepo = new ChannelsRepository();

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Cards A", email: `cards-a-${randomUUID()}@test.local` },
        { name: "Cards B", email: `cards-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;

    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      if (!chat) throw new Error("No se pudo crear el chat de prueba");
      return chat.id;
    });
  }, 30_000);

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  }, 30_000);

  beforeEach(() => {
    provider = new FakePublishingProvider();
    service = new CardsServiceCtor(dbService, cardsRepo, channelsRepo, provider);
  });

  async function createCard(content: CardContent, network: SocialNetwork) {
    return dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, { userId: userA, chatId: chatA, network, content }),
    );
  }

  async function connectAccount(
    userId: string,
    network: SocialNetwork,
    opts?: { active?: boolean },
  ) {
    return dbService.runWithTenant(userId, async (tx) => {
      const account = await channelsRepo.insertAccount(tx, {
        userId,
        network,
        providerRef: `pf_${randomUUID()}`,
        displayName: "Cuenta de prueba",
      });
      if (opts?.active === false) {
        await channelsRepo.disconnectAccount(tx, account.id);
        return { ...account, status: "disconnected" as const };
      }
      return account;
    });
  }

  it(
    "dos cards insertadas con el mismo groupId lo conservan al leerlas — así el frontend las reconoce como hermanas",
    { timeout: 15_000 },
    async () => {
      // Regresión del hueco real (2026-08-19): publication-card.tools.ts
      // no pasaba groupId nunca al crear una card — dos cards del mismo
      // turno de chat quedaban con groupId null cada una, así que
      // PublicationCard.tsx (siblingCards, filtra por groupId) nunca las
      // reconocía como parte del mismo grupo y el drawer nunca abría en
      // modo batch. Este test cubre el lado del repo/servicio: que el
      // campo se persiste y se lee de vuelta correctamente. El cálculo de
      // "hermanas" en sí vive en el frontend (sin test runner, ver
      // ScheduleDrawer/PublicationCard.tsx), no en este repo de specs.
      const sharedGroupId = randomUUID();
      const cardX = await dbService.runWithTenant(userA, (tx) =>
        cardsRepo.insertCard(tx, {
          userId: userA,
          chatId: chatA,
          network: "x",
          content: TEXT_CONTENT,
          groupId: sharedGroupId,
        }),
      );
      const cardThreads = await dbService.runWithTenant(userA, (tx) =>
        cardsRepo.insertCard(tx, {
          userId: userA,
          chatId: chatA,
          network: "threads",
          content: TEXT_CONTENT,
          groupId: sharedGroupId,
        }),
      );

      const cards = await service.listByChat(userA, chatA);
      const dtoX = cards.find((c) => c.id === cardX.id);
      const dtoThreads = cards.find((c) => c.id === cardThreads.id);
      expect(dtoX?.groupId).toBe(sharedGroupId);
      expect(dtoThreads?.groupId).toBe(sharedGroupId);
    },
  );

  it("una card sin groupId explícito queda con groupId null", { timeout: 15_000 }, async () => {
    const card = await createCard(TEXT_CONTENT, "linkedin");
    const [row] = await service
      .listByChat(userA, chatA)
      .then((cards) => cards.filter((c) => c.id === card.id));
    expect(row?.groupId).toBeNull();
  });

  it(
    "programa una card en draft (linkedin, sin media requerida)",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");

      const scheduled = await service.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });

      expect(scheduled.status).toBe("scheduled");
      expect(scheduled.socialAccountId).toBe(account.id);
    },
  );

  it("rechaza un horario a menos de 5 minutos", { timeout: 15_000 }, async () => {
    const card = await createCard(TEXT_CONTENT, "linkedin");
    const account = await connectAccount(userA, "linkedin");

    await expect(
      service.schedule(userA, card.id, { socialAccountId: account.id, scheduledAt: future(1) }),
    ).rejects.toThrow(/5 minutos/);
  });

  it("rechaza una cuenta de otra red", { timeout: 15_000 }, async () => {
    const card = await createCard(TEXT_CONTENT, "linkedin");
    const account = await connectAccount(userA, "x");

    await expect(
      service.schedule(userA, card.id, { socialAccountId: account.id, scheduledAt: future(10) }),
    ).rejects.toThrow(/no corresponde/);
  });

  it("rechaza una cuenta desconectada", { timeout: 15_000 }, async () => {
    const card = await createCard(TEXT_CONTENT, "linkedin");
    const account = await connectAccount(userA, "linkedin", { active: false });

    await expect(
      service.schedule(userA, card.id, { socialAccountId: account.id, scheduledAt: future(10) }),
    ).rejects.toThrow(/no está disponible/);
  });

  it(
    "rechaza una cuenta de otro usuario (RLS la esconde → no encontrada)",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const accountB = await connectAccount(userB, "linkedin");

      await expect(
        service.schedule(userA, card.id, { socialAccountId: accountB.id, scheduledAt: future(10) }),
      ).rejects.toThrow(/no está disponible/);
    },
  );

  it("instagram sin media se rechaza; con media se programa", { timeout: 15_000 }, async () => {
    const account = await connectAccount(userA, "instagram");

    const withoutMedia = await createCard(VISUAL_CONTENT_NO_MEDIA, "instagram");
    await expect(
      service.schedule(userA, withoutMedia.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      }),
    ).rejects.toThrow(/necesita una imagen/);

    const withMedia = await createCard(VISUAL_CONTENT_WITH_MEDIA, "instagram");
    const scheduled = await service.schedule(userA, withMedia.id, {
      socialAccountId: account.id,
      scheduledAt: future(10),
    });
    expect(scheduled.status).toBe("scheduled");
  });

  // Regresión (code review 2026-08-20): videoScriptContentSchema no tenía
  // assetIds — assertHasMedia's `"assetIds" in content` fallaba por
  // ausencia de la propiedad, no por lista vacía, para CUALQUIER card de
  // tiktok/youtube, sin importar el contenido.
  it("tiktok sin media se rechaza; con media se programa", { timeout: 15_000 }, async () => {
    const account = await connectAccount(userA, "tiktok");

    const withoutMedia = await createCard(VIDEO_CONTENT_NO_MEDIA, "tiktok");
    await expect(
      service.schedule(userA, withoutMedia.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      }),
    ).rejects.toThrow(/necesita una imagen/);

    const withMedia = await createCard(VIDEO_CONTENT_WITH_MEDIA, "tiktok");
    const scheduled = await service.schedule(userA, withMedia.id, {
      socialAccountId: account.id,
      scheduledAt: future(10),
    });
    expect(scheduled.status).toBe("scheduled");
  });

  it(
    "reprogramar cancela el providerRef viejo en el proveedor y programa uno nuevo",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");

      const first = await service.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });
      const firstProviderRef = await dbService.runWithTenant(userA, async (tx) => {
        const row = await cardsRepo.findById(tx, first.id);
        return row?.providerRef ?? null;
      });
      if (!firstProviderRef) throw new Error("Debió tener providerRef tras programar");

      const second = await service.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(20),
      });
      expect(second.status).toBe("scheduled");

      // El ref viejo ya no existe del lado del proveedor — cancel() lo borró.
      const states = await provider.getPostStates([firstProviderRef]);
      expect(states.has(firstProviderRef)).toBe(false);
    },
  );

  it(
    "una card 'failed' se puede reintentar (failed → scheduled)",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      await dbService.runWithTenant(userA, (tx) =>
        cardsRepo.markFailed(tx, card.id, { reason: "El proveedor no confirmó la publicación." }),
      );

      const retried = await service.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });
      expect(retried.status).toBe("scheduled");
    },
  );

  it(
    "un rechazo explícito del proveedor (4xx) devuelve la card a draft",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      const rejectingService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new RejectingProvider(),
      );

      await expect(
        rejectingService.schedule(userA, card.id, {
          socialAccountId: account.id,
          scheduledAt: future(10),
        }),
      ).rejects.toThrow(/socialMediaId inválido/);

      const row = await dbService.runWithTenant(userA, (tx) => cardsRepo.findById(tx, card.id));
      expect(row?.status).toBe("draft");
      expect(row?.scheduledAt).toBeNull();
      expect(row?.socialAccountId).toBeNull();
      expect(row?.providerRef).toBeNull();
      expect((row?.errorDetail as { message?: string } | null)?.message).toContain(
        "socialMediaId inválido",
      );
    },
  );

  it(
    "un fallo ambiguo del proveedor deja la card en failed y conserva horario y cuenta",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      const ambiguousService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new AmbiguousProvider(),
      );
      const scheduledAt = future(10);

      await expect(
        ambiguousService.schedule(userA, card.id, {
          socialAccountId: account.id,
          scheduledAt,
        }),
      ).rejects.toThrow();

      const row = await dbService.runWithTenant(userA, (tx) => cardsRepo.findById(tx, card.id));
      expect(row?.status).toBe("failed");
      // El rastro sobrevive — es lo que se perdía en el incidente real: sin
      // esto, un post que sí se creó en PostFast queda sin forma de
      // ubicarlo (ni horario, ni cuenta, ni provider_ref).
      expect(row?.scheduledAt?.toISOString()).toBe(new Date(scheduledAt).toISOString());
      expect(row?.socialAccountId).toBe(account.id);
      const detail = row?.errorDetail as { message?: string; providerMessage?: string } | null;
      expect(detail?.message).toMatch(/panel de PostFast/i);
      expect(detail?.providerMessage).toBe("PostFast no devolvió el id del post programado.");
    },
  );

  it(
    "un fallo ambiguo devuelve 503 con la copia de aviso de no duplicar",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      const ambiguousService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new AmbiguousProvider(),
      );

      await expect(
        ambiguousService.schedule(userA, card.id, {
          socialAccountId: account.id,
          scheduledAt: future(10),
        }),
      ).rejects.toThrow(/panel de PostFast/i);
    },
  );

  it(
    "una card failed por un fallo ambiguo se puede reintentar y termina scheduled",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      const flakyService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new FlakyProvider(),
      );

      await expect(
        flakyService.schedule(userA, card.id, {
          socialAccountId: account.id,
          scheduledAt: future(10),
        }),
      ).rejects.toThrow();
      const failedRow = await dbService.runWithTenant(userA, (tx) =>
        cardsRepo.findById(tx, card.id),
      );
      expect(failedRow?.status).toBe("failed");

      const retried = await flakyService.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });
      expect(retried.status).toBe("scheduled");
      const row = await dbService.runWithTenant(userA, (tx) => cardsRepo.findById(tx, card.id));
      expect(row?.providerRef).toBeTruthy();
      expect(row?.errorDetail).toBeNull();
    },
  );

  it(
    "scheduleGroup: un item ambiguo devuelve ok:false con el aviso y no aborta el resto",
    { timeout: 15_000 },
    async () => {
      const cardAmbiguous = await createCard(TEXT_CONTENT, "linkedin");
      const cardOk = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      // FlakyProvider falla en su primera llamada a schedule() y tiene
      // éxito en la segunda — scheduleGroup itera los items en orden, así
      // que el primer item (cardAmbiguous) recibe el fallo y el segundo
      // (cardOk) el éxito. No hace falta un provider nuevo por-cardId:
      // SchedulePostRequest ni siquiera lleva el cardId (ver
      // publishing.provider.ts), el orden de la lista ya distingue los dos.
      const mixedService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new FlakyProvider(),
      );

      const results = await mixedService.scheduleGroup(userA, {
        items: [
          {
            cardId: cardAmbiguous.id,
            socialAccountId: account.id,
            scheduledAt: future(10),
          },
          { cardId: cardOk.id, socialAccountId: account.id, scheduledAt: future(10) },
        ],
      });

      const resultAmbiguous = results.find((r) => r.cardId === cardAmbiguous.id);
      const resultOk = results.find((r) => r.cardId === cardOk.id);
      expect(resultAmbiguous?.ok).toBe(false);
      expect(resultAmbiguous?.error).toMatch(/panel de PostFast/i);
      expect(resultOk?.ok).toBe(true);
      expect(resultOk?.card?.status).toBe("scheduled");
    },
  );

  it(
    "una card failed por un fallo ambiguo no la toca reconcileDueCards",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      const ambiguousService = new CardsServiceCtor(
        dbService,
        cardsRepo,
        channelsRepo,
        new AmbiguousProvider(),
      );
      await expect(
        ambiguousService.schedule(userA, card.id, {
          socialAccountId: account.id,
          scheduledAt: future(10),
        }),
      ).rejects.toThrow();

      await service.reconcileDueCards(userA);

      const row = await dbService.runWithTenant(userA, (tx) => cardsRepo.findById(tx, card.id));
      expect(row?.status).toBe("failed");
    },
  );

  it(
    "cancelar justo mientras el proveedor sigue en vuelo no deja un providerRef huérfano estampado en una card draft",
    { timeout: 15_000 },
    async () => {
      // Regresión (code review 2026-08-20): schedule() marca "scheduled" y
      // llama al proveedor FUERA de esa transacción — si cancelSchedule()
      // corre en ese margen (providerRef todavía null), su guard
      // `if (card.providerRef)` no ve nada que cancelar y la card queda
      // "draft". Sin attachProviderRefIfScheduled, el schedule() original
      // habría estampado el providerRef real igual, encima de una card
      // draft — un post de verdad en PostFast sin ninguna card "scheduled"
      // que lo referencie. Este provider simula el race llamando
      // cancelSchedule() DESDE DENTRO de su propio schedule(), justo
      // cuando el providerRef real todavía no existe en la DB.
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");

      // Holder mutable en vez de `let raceService` reasignada: la clase
      // necesita referenciar el service antes de que exista (se lo pasan
      // a SU PROPIO constructor), pero solo lo llama de verdad dentro de
      // schedule(), ya para entonces asignado.
      const serviceRef: { current?: CardsServiceType } = {};
      class RacyCancelProvider extends FakePublishingProvider {
        capturedRef: string | undefined;
        override async schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
          await serviceRef.current?.cancelSchedule(userA, card.id);
          const result = await super.schedule(req);
          this.capturedRef = result.providerRef;
          return result;
        }
      }
      const racyProvider = new RacyCancelProvider();
      const raceService = new CardsServiceCtor(dbService, cardsRepo, channelsRepo, racyProvider);
      serviceRef.current = raceService;

      const result = await raceService.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });

      // El caller de ESTE schedule() (perdedor de la carrera) recibe el
      // estado real de la card, no una mentira de "sí se programó".
      expect(result.status).toBe("draft");

      const row = await dbService.runWithTenant(userA, (tx) => cardsRepo.findById(tx, card.id));
      expect(row?.status).toBe("draft");
      expect(row?.providerRef).toBeNull();

      // El post huérfano se canceló de verdad del lado del proveedor
      // (API pública, sin espiar estado privado del fake), no solo se
      // ignoró en nuestro lado.
      if (!racyProvider.capturedRef) throw new Error("Debió capturar un providerRef");
      const states = await racyProvider.getPostStates([racyProvider.capturedRef]);
      expect(states.has(racyProvider.capturedRef)).toBe(false);
    },
  );

  it(
    "cancelar una card programada la vuelve draft, no 'canceled'",
    { timeout: 15_000 },
    async () => {
      const card = await createCard(TEXT_CONTENT, "linkedin");
      const account = await connectAccount(userA, "linkedin");
      await service.schedule(userA, card.id, {
        socialAccountId: account.id,
        scheduledAt: future(10),
      });

      const canceled = await service.cancelSchedule(userA, card.id);
      expect(canceled.status).toBe("draft");
      expect(canceled.scheduledAt).toBeNull();
      expect(canceled.socialAccountId).toBeNull();
    },
  );

  it("cancelar una card en draft es un conflicto", { timeout: 15_000 }, async () => {
    const card = await createCard(TEXT_CONTENT, "linkedin");
    await expect(service.cancelSchedule(userA, card.id)).rejects.toThrow(/no está programada/);
  });

  it(
    "reconcileDueCards marca published/failed según el proveedor, y falla las huérfanas sin provider_ref",
    { timeout: 15_000 },
    async () => {
      const account = await connectAccount(userA, "linkedin");

      // Card A: se programa "de verdad" con un scheduledAt ya pasado del
      // lado del proveedor (bypass de la validación de 5 min — se arma el
      // estado directo por repo, como haría schedule() puertas adentro).
      // Más de RECONCILE_GRACE_MS (2 min) atrás: listDueScheduled solo
      // considera "debidas" las cards que ya pasaron ese margen de gracia.
      const cardPublished = await createCard(TEXT_CONTENT, "linkedin");
      const pastDate = new Date(Date.now() - 3 * 60_000);
      const { providerRef: refPublished } = await provider.schedule({
        network: "linkedin",
        content: TEXT_CONTENT,
        scheduledAt: pastDate,
        accountProviderRef: account.providerRef,
      });
      await dbService.runWithTenant(userA, async (tx) => {
        await cardsRepo.markScheduling(tx, cardPublished.id, {
          socialAccountId: account.id,
          scheduledAt: pastDate,
        });
        await cardsRepo.attachProviderRef(tx, cardPublished.id, refPublished);
      });

      // Card B: "huérfana" — quedó scheduled sin provider_ref, como si el
      // proceso hubiera muerto entre markScheduling y attachProviderRef.
      const cardOrphaned = await createCard(TEXT_CONTENT, "linkedin");
      await dbService.runWithTenant(userA, async (tx) => {
        await cardsRepo.markScheduling(tx, cardOrphaned.id, {
          socialAccountId: account.id,
          scheduledAt: new Date(future(10)),
        });
        // updated_at debe verse "vieja" para que listOrphanedScheduled la
        // detecte (el cutoff es now - 2min).
        await tx.execute(
          sql`update publication_cards set updated_at = now() - interval '5 minutes' where id = ${cardOrphaned.id}`,
        );
      });

      await service.reconcileDueCards(userA);

      const [rowPublished, rowOrphaned] = await dbService.runWithTenant(userA, async (tx) => [
        await cardsRepo.findById(tx, cardPublished.id),
        await cardsRepo.findById(tx, cardOrphaned.id),
      ]);
      expect(rowPublished?.status).toBe("published");
      expect(rowOrphaned?.status).toBe("failed");
    },
  );
  // ── F7: listados que alimentan el Calendario ──────────────────────────
  //
  // Se prueban contra Postgres real por lo mismo que el resto del archivo:
  // lo que está bajo prueba es el RLS, el join a chats por carpeta y el
  // orden que devuelve el planner, no una rama de JS.
  describe("listados del Calendario (F7)", () => {
    // Ventana lejana a propósito: los demás tests del archivo programan a
    // `future(N minutos)`, o sea alrededor de "ahora". Aislar el rango en
    // 2031 hace que estas aserciones puedan ser de igualdad exacta en vez
    // de "contiene", sin depender del orden en que corran los tests.
    const BASE = new Date("2031-03-10T00:00:00.000Z");
    const at = (days: number, hours = 0) =>
      new Date(BASE.getTime() + days * 86_400_000 + hours * 3_600_000);
    const WINDOW_FROM = BASE;
    const WINDOW_TO = at(7);

    const accounts: Partial<Record<SocialNetwork, string>> = {};
    let folderId: string;
    let chatInFolder: string;
    let ids: Record<string, string>;

    beforeAll(async () => {
      for (const network of ["linkedin", "instagram", "x"] as const) {
        accounts[network] = (await connectAccount(userA, network)).id;
      }

      ({ folderId, chatInFolder } = await dbService.runWithTenant(userA, async (tx) => {
        const [folder] = await tx
          .insert(folders)
          .values({ userId: userA, name: "Cliente Acme" })
          .returning({ id: folders.id });
        if (!folder) throw new Error("No se pudo crear la carpeta de prueba");
        const [chat] = await tx
          .insert(chats)
          .values({ userId: userA, folderId: folder.id })
          .returning({ id: chats.id });
        if (!chat) throw new Error("No se pudo crear el chat de la carpeta");
        return { folderId: folder.id, chatInFolder: chat.id };
      }));

      // Se arma la escena entera acá y no en cada test: son lecturas puras,
      // ningún test de este describe muta las cards.
      const place = async (opts: {
        network: SocialNetwork;
        scheduledAt: Date;
        published?: boolean;
        chatId?: string;
        orphan?: boolean;
      }) =>
        dbService.runWithTenant(userA, async (tx) => {
          const card = await cardsRepo.insertCard(tx, {
            userId: userA,
            chatId: opts.chatId ?? chatA,
            network: opts.network,
            content: TEXT_CONTENT,
          });
          const accountId = accounts[opts.network];
          if (!accountId) throw new Error(`Sin cuenta de prueba para ${opts.network}`);
          await cardsRepo.markScheduling(tx, card.id, {
            socialAccountId: accountId,
            scheduledAt: opts.scheduledAt,
          });
          // El ref sintético NO es decorativo: markScheduling deja
          // provider_ref en null a propósito, y listOrphanedScheduled marca
          // `failed` cualquier card `scheduled` sin ref con más de
          // RECONCILE_GRACE_MS (2 min) de antigüedad — sin mirar
          // scheduled_at. listByRange arranca con maybeReconcile y el
          // beforeEach construye un CardsService nuevo, así que el cooldown
          // tampoco protege: si este describe tarda más de dos minutos
          // contra la DB tunelizada, las fixtures se volvían `failed` a
          // mitad de la corrida. Mismo motivo por el que seed-dev.ts los
          // falsea.
          await cardsRepo.attachProviderRef(tx, card.id, `pf_spec_${randomUUID()}`);
          if (opts.published) await cardsRepo.markPublished(tx, card.id, opts.scheduledAt);
          if (opts.orphan) {
            // insertCard exige chatId; la orfandad real la produce borrar el
            // chat (FK "set null"). Se simula el estado final directamente.
            await tx.execute(
              sql`update publication_cards set chat_id = null where id = ${card.id}`,
            );
          }
          return card.id;
        });

      ids = {
        liMorning: await place({ network: "linkedin", scheduledAt: at(0, 9) }),
        igNoon: await place({ network: "instagram", scheduledAt: at(0, 12) }),
        xPublished: await place({ network: "x", scheduledAt: at(1, 8), published: true }),
        orphan: await place({ network: "linkedin", scheduledAt: at(2, 10), orphan: true }),
        inFolder: await place({
          network: "instagram",
          scheduledAt: at(3, 18),
          chatId: chatInFolder,
        }),
        outOfRange: await place({ network: "linkedin", scheduledAt: at(40, 9) }),
        loose: (await createCard(TEXT_CONTENT, "linkedin")).id,
      };
    }, 30_000);

    it(
      "trae el rango completo en cualquier estado, ordenado por hora, y deja fuera lo de afuera",
      { timeout: 15_000 },
      async () => {
        const rows = await service.listByRange(userA, WINDOW_FROM, WINDOW_TO);

        expect(rows.map((row) => row.id)).toEqual([
          ids.liMorning,
          ids.igNoon,
          ids.xPublished,
          ids.orphan,
          ids.inFolder,
        ]);
        // El publicado sigue en el calendario (decisión de producto: el
        // pipeline no borra su historia) — findConflicts jamás lo devolvería.
        expect(rows.find((row) => row.id === ids.xPublished)?.status).toBe("published");
        // El borrador sin fecha no cae en ningún rango.
        expect(rows.some((row) => row.id === ids.loose)).toBe(false);
      },
    );

    it("filtra por estado y por red", { timeout: 15_000 }, async () => {
      const scheduled = await service.listByRange(userA, WINDOW_FROM, WINDOW_TO, {
        status: ["scheduled"],
      });
      expect(scheduled.some((row) => row.id === ids.xPublished)).toBe(false);
      expect(scheduled.map((row) => row.id)).toContain(ids.liMorning);

      const instagram = await service.listByRange(userA, WINDOW_FROM, WINDOW_TO, {
        network: ["instagram"],
      });
      expect(instagram.map((row) => row.id)).toEqual([ids.igNoon, ids.inFolder]);
    });

    it(
      "el filtro por carpeta sale del chat de origen, así que la card huérfana no matchea",
      { timeout: 15_000 },
      async () => {
        const rows = await service.listByRange(userA, WINDOW_FROM, WINDOW_TO, { folderId });

        expect(rows.map((row) => row.id)).toEqual([ids.inFolder]);
        expect(rows.some((row) => row.id === ids.orphan)).toBe(false);
      },
    );

    it("el RLS aísla el calendario entre usuarios", { timeout: 15_000 }, async () => {
      const rows = await service.listByRange(userB, WINDOW_FROM, WINDOW_TO);
      expect(rows).toEqual([]);
    });

    it("listDrafts solo devuelve borradores sin fecha", { timeout: 15_000 }, async () => {
      const drafts = await service.listDrafts(userA);

      expect(drafts.map((row) => row.id)).toContain(ids.loose);
      expect(drafts.some((row) => row.id === ids.liMorning)).toBe(false);
      expect(drafts.every((row) => row.status === "draft" && row.scheduledAt === null)).toBe(true);
    });
  });
});
