import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditLedger, users } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, después
// de poblar process.env (env.ts valida el entorno en el import) — mismo
// patrón que db/rls.spec.ts.
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { CreditsRepository as CreditsRepositoryType } from "./credits.repository.js";
import type { CreditsService as CreditsServiceType } from "./credits.service.js";
import type { InsufficientQuotaError as InsufficientQuotaErrorType } from "./errors.js";

// DoD de F5: una acción concurrente doble no produce saldo negativo — se
// prueba contra Postgres real, conectando como presencia_app, porque el
// mecanismo anti-race es un advisory lock de Postgres (CreditsRepository.
// lockUser), no algo que un mock pueda ejercitar de verdad.

let dbService: DbServiceType;
let repo: CreditsRepositoryType;
let creditsService: CreditsServiceType;
let InsufficientQuotaError: typeof InsufficientQuotaErrorType;
let userA: string;
let userB: string;
let userC: string;

describe("CreditsService", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { CreditsRepository } = await import("./credits.repository.js");
    const { CreditsService } = await import("./credits.service.js");
    ({ InsufficientQuotaError } = await import("./errors.js"));

    dbService = new DbService();
    repo = new CreditsRepository();
    creditsService = new CreditsService(dbService, repo);

    // users no tiene RLS (la administra Better Auth); el insert directo es
    // válido, igual que en db/rls.spec.ts. planTier default "creator".
    const [a, b, c] = await dbService.db
      .insert(users)
      .values([
        { name: "Créditos A", email: `credits-a-${randomUUID()}@test.local` },
        { name: "Créditos B", email: `credits-b-${randomUUID()}@test.local` },
        { name: "Créditos C", email: `credits-c-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b || !c) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    userC = c.id;
  }, 30_000);

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB, userC]));
    await dbService.onModuleDestroy();
  }, 30_000);

  it(
    "otorga el monthly_grant en el primer acceso y no lo repite en el segundo (ensureCurrentCycle idempotente)",
    { timeout: 15_000 },
    async () => {
      const first = await creditsService.getQuotaStatus(userA);
      const second = await creditsService.getQuotaStatus(userA);

      expect(first.rawBalance).toBe(30_000); // PLAN_QUOTAS.creator, rate-card.ts
      expect(second.rawBalance).toBe(30_000);

      const grants = await dbService.runWithTenant(userA, (tx) =>
        tx.select().from(creditLedger).where(eq(creditLedger.reason, "monthly_grant")),
      );
      expect(grants).toHaveLength(1);
    },
  );

  it(
    "race condition real: dos spend() concurrentes con saldo para una sola acción — exactamente uno gana, el saldo final nunca es negativo",
    { timeout: 15_000 },
    async () => {
      // Deja el saldo en 750: alcanza para un image_generation (700) pero no para dos.
      await dbService.runWithTenant(userA, async (tx) => {
        await repo.lockUser(tx, userA);
        const balance = await repo.balanceSince(tx, userA, new Date(0));
        await repo.insertEntry(tx, {
          userId: userA,
          delta: 750 - balance,
          reason: "adjustment",
          rateCardVersion: 1,
        });
      });

      const results = await Promise.allSettled([
        dbService.runWithTenant(userA, (tx) =>
          creditsService.spend(tx, { userId: userA, reason: "image_generation" }),
        ),
        dbService.runWithTenant(userA, (tx) =>
          creditsService.spend(tx, { userId: userA, reason: "image_generation" }),
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientQuotaError);

      const status = await creditsService.getQuotaStatus(userA);
      expect(status.rawBalance).toBe(50); // 750 - 700, no queda en negativo
      expect(status.rawBalance).toBeGreaterThanOrEqual(0);
    },
  );

  it(
    "idempotencia: el mismo (reason, reference_type, reference_id) no se cobra dos veces",
    { timeout: 15_000 },
    async () => {
      const referenceId = randomUUID();
      const insertOnce = () =>
        dbService.runWithTenant(userA, (tx) =>
          repo.insertEntry(tx, {
            userId: userA,
            delta: -1,
            reason: "idea_generation",
            referenceType: "message",
            referenceId,
            rateCardVersion: 1,
          }),
        );

      await insertOnce();
      await expect(insertOnce()).rejects.toThrow();
    },
  );

  it(
    "credit_ledger es append-only por el motor, no solo por convención",
    { timeout: 15_000 },
    async () => {
      const entryId = await dbService.runWithTenant(userA, async (tx) => {
        const entry = await repo.insertEntry(tx, {
          userId: userA,
          delta: -1,
          reason: "idea_generation",
          rateCardVersion: 1,
        });
        return entry.id;
      });

      const updateError: unknown = await dbService
        .runWithTenant(userA, (tx) =>
          tx.update(creditLedger).set({ delta: -999 }).where(eq(creditLedger.id, entryId)),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(updateError).toBeInstanceOf(Error);
      expect(String((updateError as Error).cause)).toMatch(/permission denied/);

      const deleteError: unknown = await dbService
        .runWithTenant(userA, (tx) => tx.delete(creditLedger).where(eq(creditLedger.id, entryId)))
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(deleteError).toBeInstanceOf(Error);
      expect(String((deleteError as Error).cause)).toMatch(/permission denied/);
    },
  );

  it(
    "aislamiento: el ledger de un usuario no es visible ni escribible desde otro tenant",
    { timeout: 15_000 },
    async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(creditLedger));
      expect(rows).toHaveLength(0);

      const error: unknown = await dbService
        .runWithTenant(userB, (tx) =>
          tx.insert(creditLedger).values({ userId: userA, delta: 1, reason: "adjustment" }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).cause)).toMatch(/row-level security/);
    },
  );

  it(
    "rollover de ciclo: el saldo nuevo no se contamina con el cierre del anterior",
    { timeout: 15_000 },
    async () => {
      // Ancla el ciclo de userC hace 40 días para forzar un rollover en el
      // próximo acceso a su cuota (currentCycleWindow ya cruzó su aniversario).
      const cycleAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      await dbService.db.update(users).set({ createdAt: cycleAgo }).where(eq(users.id, userC));

      // Simula el ciclo anterior a mano: grant de 30,000, gastó 25,000 →
      // quedaban 5,000 sin usar cuando debió cerrar.
      await dbService.runWithTenant(userC, async (tx) => {
        await tx.insert(creditLedger).values({
          userId: userC,
          delta: 30_000,
          reason: "monthly_grant",
          rateCardVersion: 1,
          createdAt: cycleAgo,
        });
        await tx.insert(creditLedger).values({
          userId: userC,
          delta: -25_000,
          reason: "chat_message",
          rateCardVersion: 1,
          createdAt: new Date(cycleAgo.getTime() + 24 * 60 * 60 * 1000),
        });
      });

      const status = await creditsService.getQuotaStatus(userC);

      // Bajo el bug original, cycle_expiration (-5,000) y el monthly_grant
      // nuevo (+30,000) comparten created_at (mismo now() de transacción) y
      // el filtro por fecha los sumaba juntos → 25,000. Por id se separan
      // bien → el ciclo nuevo arranca limpio en 30,000.
      expect(status.rawBalance).toBe(30_000);

      const entries = await dbService.runWithTenant(userC, (tx) =>
        tx
          .select()
          .from(creditLedger)
          .where(eq(creditLedger.userId, userC))
          .orderBy(creditLedger.id),
      );
      const expirations = entries.filter((e) => e.reason === "cycle_expiration");
      expect(expirations).toHaveLength(1);
      expect(expirations[0]?.delta).toBe(-5_000);
      expect(entries.filter((e) => e.reason === "monthly_grant")).toHaveLength(2);
    },
  );
});
