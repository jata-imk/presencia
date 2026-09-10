import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { creditLedger, users } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";
import type { CreditReason, PlanTier } from "./rate-card.js";

// Todo acceso a credit_ledger vive aquí (patrón de ChatRepository /
// AiUsageRepository). Las queries sobre credit_ledger no filtran por
// user_id: el RLS de la transacción es el filtro. `users` es la excepción
// del repo entero (no tiene RLS, Better Auth es dueño — mismo contraste
// documentado en profile.repository.ts) y por eso sí filtra explícito.

export type CreditLedgerRow = typeof creditLedger.$inferSelect;

export interface InsertLedgerEntryInput {
  userId: string;
  delta: number;
  reason: CreditReason;
  referenceType?: string | null;
  referenceId?: string | null;
  rateCardVersion: number;
}

export interface UserCycleAnchor {
  planTier: PlanTier;
  createdAt: Date;
}

@Injectable()
export class CreditsRepository {
  /**
   * Serializa toda lectura-luego-escritura del ledger de un usuario dentro
   * de la transacción actual: dos `spend()`/`ensureCurrentCycle()`
   * concurrentes para el mismo usuario nunca se pisan — el segundo espera
   * a que el primero haga commit/rollback antes de leer el saldo. Es el
   * mecanismo anti-race del DoD, no el CHECK ni el índice.
   */
  /**
   * Como `lockUser` pero SIN esperar: devuelve `false` si otro lo tiene tomado.
   * Es para el pase diario (F8), que solo adelanta trabajo: quedarse bloqueado
   * detrás de un request largo de un usuario atrasa a todos los demás del pase,
   * y si el pase entero cruza su `expireInSeconds`, pg-boss lo da por muerto y
   * puede arrancar un segundo pase concurrente. Saltarse a un usuario ocupado
   * no cuesta nada: el pase de mañana lo agarra, y si entra antes, la ruta
   * perezosa se lo resuelve en el acto.
   */
  async tryLockUser(tx: Tx, userId: string): Promise<boolean> {
    const result = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${userId}, 0)) as locked`,
    );
    return result.rows[0]?.locked === true;
  }

  async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
  }

  /**
   * Los usuarios con correo verificado, para el job diario de ciclo (F8). No
   * necesita tenant fijado: `users` NO tiene RLS —la administra Better Auth—,
   * así que el job la lee desde `runWorkerScan`, la única puerta del repo para
   * acceso sin tenant.
   *
   * El filtro por `email_verified` no es cosmético: sin él, cada cuenta sin
   * verificar acumularía dos asientos por mes para siempre (el
   * `cycle_expiration` del ciclo viejo y el `monthly_grant` del nuevo), y el
   * ledger es append-only por el motor desde la migración 0008.
   *
   * Límite conocido: el job recorre a todos, no solo a quienes les toca
   * renovar hoy. Con el ciclo anclado al aniversario de cada uno, filtrar en
   * SQL pediría repetir acá el cálculo que vive en `cycle.ts`, y duplicar esa
   * regla es peor que un pase de más al día — `ensureCurrentCycle` no escribe
   * nada cuando el ciclo ya está otorgado.
   */
  async listVerifiedUserIds(tx: Tx): Promise<string[]> {
    const rows = await tx.select({ id: users.id }).from(users).where(eq(users.emailVerified, true));
    return rows.map((row) => row.id);
  }

  async balanceSince(tx: Tx, userId: string, since: Date): Promise<number> {
    const [row] = await tx
      .select({ balance: sql<string>`coalesce(sum(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), gte(creditLedger.createdAt, since)));
    return Number(row?.balance ?? 0);
  }

  /**
   * Saldo del ciclo vigente: SUM(delta) desde el `monthly_grant` que lo abrió
   * (inclusive), por `id` — nunca por `created_at`. Dentro de una misma
   * transacción, Postgres `now()` devuelve el inicio de la transacción, así
   * que `cycle_expiration`/`adjustment`/`monthly_grant` insertados juntos en
   * `ensureCurrentCycle` comparten el mismo `created_at` — un filtro por
   * timestamp no puede separar "lo que cierra el ciclo viejo" de "lo que
   * abre el nuevo". `id` (bigint identity) es monotónico incluso dentro de
   * la misma transacción, así que sí distingue el orden real de inserción.
   */
  async balanceFrom(tx: Tx, userId: string, fromId: number): Promise<number> {
    const [row] = await tx
      .select({ balance: sql<string>`coalesce(sum(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), gte(creditLedger.id, fromId)));
    return Number(row?.balance ?? 0);
  }

  async lastGrant(tx: Tx, userId: string): Promise<CreditLedgerRow | undefined> {
    const [row] = await tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "monthly_grant")))
      .orderBy(desc(creditLedger.id))
      .limit(1);
    return row;
  }

  async insertEntry(tx: Tx, input: InsertLedgerEntryInput): Promise<CreditLedgerRow> {
    const [entry] = await tx
      .insert(creditLedger)
      .values({
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        rateCardVersion: input.rateCardVersion,
      })
      .returning();
    if (!entry) throw new Error("No se pudo registrar el movimiento de créditos");
    return entry;
  }

  /** `users` no tiene RLS — filtra por id explícito (ver comentario de cabecera). */
  async findUserForCycle(tx: Tx, userId: string): Promise<UserCycleAnchor | undefined> {
    const [row] = await tx
      .select({ planTier: users.planTier, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }
}
