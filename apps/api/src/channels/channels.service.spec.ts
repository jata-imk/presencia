import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../db/schema.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que credits.service.spec.ts / db/rls.spec.ts (env.ts valida el
// entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { ChannelsRepository as ChannelsRepositoryType } from "./channels.repository.js";
import type { ChannelsService as ChannelsServiceType } from "./channels.service.js";

// El diff de conexión (ChannelsService.claimConnectIntent) necesita RLS real
// para probar el caso interesante: dos tenants reclamando la MISMA
// providerRef, donde uno de los dos no puede ni ver la fila del otro (ver
// rls.spec.ts). Un mock de repo no ejercitaría ese comportamiento.

let dbService: DbServiceType;
let repo: ChannelsRepositoryType;
let ChannelsServiceCtor: new (
  dbService: DbServiceType,
  repo: ChannelsRepositoryType,
  provider: FakePublishingProvider,
) => ChannelsServiceType;
let service: ChannelsServiceType;
let provider: FakePublishingProvider;
let userA: string;
let userB: string;

describe("ChannelsService", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { ChannelsRepository } = await import("./channels.repository.js");
    ({ ChannelsService: ChannelsServiceCtor } = await import("./channels.service.js"));

    dbService = new DbService();
    repo = new ChannelsRepository();

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
    service = new ChannelsServiceCtor(dbService, repo, provider);
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

      const accounts = await service.listAccounts(userA);
      const stillDisconnected = accounts.find((a) => a.id === firstClaim.id);
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
});
