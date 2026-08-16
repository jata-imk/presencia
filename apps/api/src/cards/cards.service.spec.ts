import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { chats, users } from "../db/schema.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
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

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
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
});
