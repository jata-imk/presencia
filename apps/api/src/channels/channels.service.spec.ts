import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CardContent } from "@presencia/shared";
import { chats, users } from "../db/schema.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que credits.service.spec.ts / db/rls.spec.ts (env.ts valida el
// entorno al importar).
import type { CardsRepository as CardsRepositoryType } from "../cards/cards.repository.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { ChannelsRepository as ChannelsRepositoryType } from "./channels.repository.js";
import type { ChannelsService as ChannelsServiceType } from "./channels.service.js";

const TEXT_CONTENT: CardContent = {
  archetype: "text_first",
  body: "Cinco hábitos que cambiaron mi productividad.",
  hashtags: [],
  assetIds: [],
};

// El diff de conexión (ChannelsService.claimConnectIntent) necesita RLS real
// para probar el caso interesante: dos tenants reclamando la MISMA
// providerRef, donde uno de los dos no puede ni ver la fila del otro (ver
// rls.spec.ts). Un mock de repo no ejercitaría ese comportamiento.

let dbService: DbServiceType;
let repo: ChannelsRepositoryType;
let cardsRepo: CardsRepositoryType;
let ChannelsServiceCtor: new (
  dbService: DbServiceType,
  repo: ChannelsRepositoryType,
  provider: FakePublishingProvider,
  cardsRepo: CardsRepositoryType,
) => ChannelsServiceType;
let service: ChannelsServiceType;
let provider: FakePublishingProvider;
let userA: string;
let userB: string;
let chatA: string;

describe("ChannelsService", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { ChannelsRepository } = await import("./channels.repository.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");
    ({ ChannelsService: ChannelsServiceCtor } = await import("./channels.service.js"));

    dbService = new DbService();
    repo = new ChannelsRepository();
    cardsRepo = new CardsRepository();

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Canales A", email: `channels-a-${randomUUID()}@test.local` },
        { name: "Canales B", email: `channels-b-${randomUUID()}@test.local` },
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
    // FakePublishingProvider no tiene reset(); recreamos provider+service
    // entre tests para que el "workspace" empiece limpio en cada caso (el
    // diff del intent depende de qué cuentas existan YA en el proveedor).
    provider = new FakePublishingProvider();
    service = new ChannelsServiceCtor(dbService, repo, provider, cardsRepo);
  });

  it(
    "reclama solo las cuentas nuevas respecto al snapshot del intent",
    { timeout: 15_000 },
    async () => {
      provider.seedAccount({ providerRef: "old_1", network: "linkedin", displayName: "Vieja" });
      const intent = await service.createConnectIntent(userA);

      provider.seedAccount({ providerRef: "new_1", network: "x", displayName: "Nueva" });
      const claimed = await service.claimConnectIntent(userA, intent.id);

      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ network: "x", displayName: "Nueva" });

      const accounts = await service.listAccounts(userA);
      expect(accounts.map((a) => a.displayName)).toEqual(["Nueva"]);
    },
  );

  it("un intent expirado rechaza el claim", { timeout: 15_000 }, async () => {
    const intent = await service.createConnectIntent(userA);
    // Fuerza la expiración sin esperar el TTL real de 30 min.
    await dbService.runWithTenant(userA, (tx) =>
      tx.execute(
        sql`update social_connect_intents set expires_at = now() - interval '1 minute' where id = ${intent.id}`,
      ),
    );
    await expect(service.claimConnectIntent(userA, intent.id)).rejects.toThrow(/expiró/);
  });

  it("reclamar dos veces el mismo intent falla la segunda vez", { timeout: 15_000 }, async () => {
    const intent = await service.createConnectIntent(userA);
    provider.seedAccount({ providerRef: "new_2", network: "linkedin", displayName: null });
    await service.claimConnectIntent(userA, intent.id);
    await expect(service.claimConnectIntent(userA, intent.id)).rejects.toThrow(/ya se usó/);
  });

  it(
    "un intent de otro tenant no se puede reclamar (RLS lo esconde)",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      await expect(service.claimConnectIntent(userB, intent.id)).rejects.toThrow(
        /No encontramos esa conexión/,
      );
    },
  );

  it(
    "una providerRef ya vista nunca vuelve a calificar como nueva en un intent futuro",
    { timeout: 15_000 },
    async () => {
      const intent1 = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "reconnect_1", network: "facebook", displayName: "V1" });
      const [firstClaim] = await service.claimConnectIntent(userA, intent1.id);
      if (!firstClaim) throw new Error("Debió reclamar la cuenta");
      await service.disconnectAccount(userA, firstClaim.id);

      // El proveedor "sigue viendo" la misma cuenta (nunca se fue de
      // PostFast) — el segundo intent la ve como preexistente, no nueva:
      // reclamarla de nuevo por este camino no le devuelve nada.
      const intent2 = await service.createConnectIntent(userA);
      const secondClaim = await service.claimConnectIntent(userA, intent2.id);
      expect(secondClaim).toHaveLength(0);

      // listAccounts ya no trae desconectadas (F6 follow-up) — se busca en
      // su vista aparte.
      const disconnectedAccounts = await service.listDisconnectedAccounts(userA);
      const stillDisconnected = disconnectedAccounts.find((a) => a.id === firstClaim.id);
      expect(stillDisconnected?.status).toBe("disconnected");
    },
  );

  it(
    "reactivateAccount reconecta directo una cuenta propia, sin pasar por el diff",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "reconnect_2", network: "facebook", displayName: "V1" });
      const [firstClaim] = await service.claimConnectIntent(userA, intent.id);
      if (!firstClaim) throw new Error("Debió reclamar la cuenta");
      await service.disconnectAccount(userA, firstClaim.id);

      const reactivated = await service.reactivateAccount(userA, firstClaim.id);
      expect(reactivated.status).toBe("active");

      const accounts = await service.listAccounts(userA);
      expect(accounts.find((a) => a.id === firstClaim.id)?.status).toBe("active");
    },
  );

  it("reactivar una cuenta inexistente lanza NotFound", { timeout: 15_000 }, async () => {
    await expect(service.reactivateAccount(userA, randomUUID())).rejects.toThrow(
      /No encontramos esa cuenta/,
    );
  });

  it(
    "reactivar una cuenta que ya no existe en el proveedor la rechaza sin voltear el flag",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "revoked_1", network: "facebook", displayName: "V1" });
      const [firstClaim] = await service.claimConnectIntent(userA, intent.id);
      if (!firstClaim) throw new Error("Debió reclamar la cuenta");
      await service.disconnectAccount(userA, firstClaim.id);

      // Simula un token revocado / cuenta borrada del lado de PostFast: un
      // provider fresh, sin esa ref seedeada, mismo repo/dbService que el
      // service original (así siguen viendo la misma fila en la DB).
      const revokedProvider = new FakePublishingProvider();
      const serviceWithRevokedProvider = new ChannelsServiceCtor(
        dbService,
        repo,
        revokedProvider,
        cardsRepo,
      );

      await expect(
        serviceWithRevokedProvider.reactivateAccount(userA, firstClaim.id),
      ).rejects.toThrow(/ya no está conectada/);

      const disconnectedAccounts = await service.listDisconnectedAccounts(userA);
      expect(disconnectedAccounts.find((a) => a.id === firstClaim.id)?.status).toBe("disconnected");
    },
  );

  it(
    "reactivar una cuenta que el proveedor lista pero DISABLED (token revocado) también la rechaza",
    { timeout: 15_000 },
    async () => {
      // Distinto del caso de arriba: acá el proveedor SIGUE listando la
      // cuenta (no desapareció del workspace), solo que ya no es usable —
      // postfa.st/docs/accounts/list confirma que connectionStatus:"DISABLED"
      // no la quita de GET /social-media/my-social-accounts. Antes del fix,
      // reactivateAccount solo chequeaba presencia por providerRef y esto
      // habría pasado como "sigue conectada".
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "disabled_1", network: "facebook", displayName: "V1" });
      const [firstClaim] = await service.claimConnectIntent(userA, intent.id);
      if (!firstClaim) throw new Error("Debió reclamar la cuenta");
      await service.disconnectAccount(userA, firstClaim.id);

      const disabledProvider = new FakePublishingProvider();
      disabledProvider.seedAccount({
        providerRef: "disabled_1",
        network: "facebook",
        displayName: "V1",
        connected: false,
      });
      const serviceWithDisabledProvider = new ChannelsServiceCtor(
        dbService,
        repo,
        disabledProvider,
        cardsRepo,
      );

      await expect(
        serviceWithDisabledProvider.reactivateAccount(userA, firstClaim.id),
      ).rejects.toThrow(/ya no está conectada/);

      const disconnectedAccounts = await service.listDisconnectedAccounts(userA);
      expect(disconnectedAccounts.find((a) => a.id === firstClaim.id)?.status).toBe("disconnected");
    },
  );

  it(
    "claimConnectIntent no reclama una cuenta 'nueva' que el proveedor lista como DISABLED",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({
        providerRef: "disabled_2",
        network: "facebook",
        displayName: "V1",
        connected: false,
      });

      const claimed = await service.claimConnectIntent(userA, intent.id);

      expect(claimed).toHaveLength(0);
    },
  );

  it(
    "reautorizar en postfa.st una cuenta propia ya conocida la reclama de nuevo en vez de perderla en silencio",
    { timeout: 15_000 },
    async () => {
      const intent1 = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "selfheal_1", network: "linkedin", displayName: "V1" });
      const [firstClaim] = await service.claimConnectIntent(userA, intent1.id);
      if (!firstClaim) throw new Error("Debió reclamar la cuenta");
      await service.disconnectAccount(userA, firstClaim.id);

      // Simula el caso real reportado: el token expiró, reactivateAccount
      // rechazó (provider.listAccounts() ya no la traía), el usuario le dio
      // "Conectar red" de nuevo y reautorizó en postfa.st. El intent nuevo
      // no "conocía" esta cuenta todavía (knownAccountRefs vacío, como si
      // el token hubiera expirado antes de crear el intent) — el
      // providerRef vuelve a aparecer como "nuevo" en el diff, choca contra
      // la fila que ya existe, y el catch de claimConnectIntent debe
      // reactivarla en vez de tragarse el conflicto en silencio.
      const freshIntent = await dbService.runWithTenant(userA, (tx) =>
        repo.insertIntent(tx, {
          userId: userA,
          knownAccountRefs: [],
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      const reclaimed = await service.claimConnectIntent(userA, freshIntent.id);
      expect(reclaimed).toHaveLength(1);
      expect(reclaimed[0]?.id).toBe(firstClaim.id);
      expect(reclaimed[0]?.status).toBe("active");

      const accounts = await service.listAccounts(userA);
      expect(accounts.find((a) => a.id === firstClaim.id)?.status).toBe("active");
    },
  );

  it(
    "dos tenants reclamando la misma cuenta nueva: solo uno se la queda, el otro no la roba",
    { timeout: 15_000 },
    async () => {
      const intentA = await service.createConnectIntent(userA);
      const intentB = await service.createConnectIntent(userB);
      provider.seedAccount({
        providerRef: "contested",
        network: "linkedin",
        displayName: "Disputada",
      });

      const claimedA = await service.claimConnectIntent(userA, intentA.id);
      const claimedB = await service.claimConnectIntent(userB, intentB.id);

      expect(claimedA).toHaveLength(1);
      expect(claimedB).toHaveLength(0);

      const accountsA = await service.listAccounts(userA);
      const accountsB = await service.listAccounts(userB);
      expect(accountsA.some((a) => a.displayName === "Disputada")).toBe(true);
      expect(accountsB.some((a) => a.displayName === "Disputada")).toBe(false);
    },
  );

  it("desconectar una cuenta inexistente lanza NotFound", { timeout: 15_000 }, async () => {
    await expect(service.disconnectAccount(userA, randomUUID())).rejects.toThrow(
      /No encontramos esa cuenta/,
    );
  });

  it(
    "listAccounts no trae desconectadas; listDisconnectedAccounts sí — vistas separadas (F6 follow-up)",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "split_1", network: "linkedin", displayName: "V1" });
      const [claimed] = await service.claimConnectIntent(userA, intent.id);
      if (!claimed) throw new Error("Debió reclamar la cuenta");

      expect((await service.listAccounts(userA)).some((a) => a.id === claimed.id)).toBe(true);
      expect((await service.listDisconnectedAccounts(userA)).some((a) => a.id === claimed.id)).toBe(
        false,
      );

      await service.disconnectAccount(userA, claimed.id);

      expect((await service.listAccounts(userA)).some((a) => a.id === claimed.id)).toBe(false);
      expect((await service.listDisconnectedAccounts(userA)).some((a) => a.id === claimed.id)).toBe(
        true,
      );
    },
  );

  it(
    "deleteAccount rechaza si la cuenta tiene una card scheduled apuntándole",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({
        providerRef: "delete_guard_1",
        network: "linkedin",
        displayName: "V1",
      });
      const [claimed] = await service.claimConnectIntent(userA, intent.id);
      if (!claimed) throw new Error("Debió reclamar la cuenta");

      await dbService.runWithTenant(userA, async (tx) => {
        const card = await cardsRepo.insertCard(tx, {
          userId: userA,
          chatId: chatA,
          network: "linkedin",
          content: TEXT_CONTENT,
        });
        await cardsRepo.markScheduling(tx, card.id, {
          socialAccountId: claimed.id,
          scheduledAt: new Date(Date.now() + 10 * 60_000),
        });
      });

      await expect(service.deleteAccount(userA, claimed.id)).rejects.toThrow(
        /publicaciones programadas/,
      );

      // sigue ahí, no se borró — el rechazo debe ser real, no cosmético
      expect((await service.listAccounts(userA)).some((a) => a.id === claimed.id)).toBe(true);
    },
  );

  it(
    "deleteAccount sin cards scheduled borra la cuenta de verdad — no reaparece en ninguna vista",
    { timeout: 15_000 },
    async () => {
      const intent = await service.createConnectIntent(userA);
      provider.seedAccount({ providerRef: "delete_ok_1", network: "linkedin", displayName: "V1" });
      const [claimed] = await service.claimConnectIntent(userA, intent.id);
      if (!claimed) throw new Error("Debió reclamar la cuenta");

      await service.deleteAccount(userA, claimed.id);

      expect((await service.listAccounts(userA)).some((a) => a.id === claimed.id)).toBe(false);
      expect((await service.listDisconnectedAccounts(userA)).some((a) => a.id === claimed.id)).toBe(
        false,
      );
    },
  );

  it("eliminar una cuenta inexistente lanza NotFound", { timeout: 15_000 }, async () => {
    await expect(service.deleteAccount(userA, randomUUID())).rejects.toThrow(
      /No encontramos esa cuenta/,
    );
  });
});
