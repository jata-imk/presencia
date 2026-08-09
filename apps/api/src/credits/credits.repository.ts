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
  async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
  }

  async balanceSince(tx: Tx, userId: string, since: Date): Promise<number> {
    const [row] = await tx
      .select({ balance: sql<string>`coalesce(sum(${creditLedger.delta}), 0)` })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), gte(creditLedger.createdAt, since)));
    return Number(row?.balance ?? 0);
  }

  async lastGrant(tx: Tx, userId: string): Promise<CreditLedgerRow | undefined> {
    const [row] = await tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "monthly_grant")))
      .orderBy(desc(creditLedger.createdAt))
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
