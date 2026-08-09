import { Inject, Injectable } from "@nestjs/common";
import type { AiTaskKind } from "../ai/provider-registry.js";
import { DbService, type Tx } from "../db/db.service.js";
import { CreditsRepository } from "./credits.repository.js";
import { currentCycleWindow } from "./cycle.js";
import { InsufficientQuotaError } from "./errors.js";
import {
  CURRENT_RATE_CARD_VERSION,
  PLAN_QUOTAS,
  quoteChatTurn,
  quoteFlatAction,
  unitsToPublications,
  type ChatTurnUsage,
  type CreditReason,
  type PlanTier,
} from "./rate-card.js";

export interface QuotaStatus {
  tier: PlanTier;
  /** Saldo crudo — puede ser negativo si un turno de chat sobregiró (charge()). Uso interno. */
  rawBalance: number;
  quota: number;
  /** 0-100, nunca negativo — lo que se muestra. */
  percentRemaining: number;
  publicationsRemaining: number;
  renewsAt: Date;
}

export interface SpendInput {
  userId: string;
  reason: CreditReason;
  referenceType?: string;
  referenceId?: string;
}

export interface ChargeInput {
  userId: string;
  usage: ChatTurnUsage;
  taskKind: AiTaskKind;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class CreditsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CreditsRepository) private readonly repo: CreditsRepository,
  ) {}

  /** Gate antes de arrancar un turno de chat (bloqueo suave, no cobra). */
  async assertHasQuota(userId: string, minimumUnits: number): Promise<void> {
    const status = await this.getQuotaStatus(userId);
    if (status.rawBalance < minimumUnits) {
      throw new InsufficientQuotaError(userId, minimumUnits, status.rawBalance);
    }
  }

  /**
   * Cobro de costo conocido de antemano (imagen, multi-adapt, calendario
   * semanal). Rechaza si no alcanza — nunca deja saldo negativo. El caller
   * decide la transacción: o se cobra y se produce el efecto, o ninguna de
   * las dos (modelo-de-datos.md).
   */
  async spend(tx: Tx, input: SpendInput): Promise<void> {
    const units = quoteFlatAction(input.reason);
    await this.repo.lockUser(tx, input.userId);
    const { cycleStart } = await this.ensureCurrentCycle(tx, input.userId);
    const balance = await this.repo.balanceSince(tx, input.userId, cycleStart);
    if (balance < units) {
      throw new InsufficientQuotaError(input.userId, units, balance);
    }
    await this.repo.insertEntry(tx, {
      userId: input.userId,
      delta: -units,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      rateCardVersion: CURRENT_RATE_CARD_VERSION,
    });
  }

  /**
   * Cobro post-hoc con el usage real de un turno de chat. A propósito puede
   * dejar saldo negativo — el asiento registra el costo real, nunca lo
   * recorta al saldo disponible (el gate de `assertHasQuota` es lo que
   * evita que esto ocurra seguido, no esto).
   */
  async charge(tx: Tx, input: ChargeInput): Promise<void> {
    const units = quoteChatTurn(input.usage, input.taskKind);
    await this.repo.lockUser(tx, input.userId);
    await this.ensureCurrentCycle(tx, input.userId);
    await this.repo.insertEntry(tx, {
      userId: input.userId,
      delta: -units,
      reason: "chat_message",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      rateCardVersion: CURRENT_RATE_CARD_VERSION,
    });
  }

  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      await this.repo.lockUser(tx, userId);
      const { tier, cycleStart, renewsAt } = await this.ensureCurrentCycle(tx, userId);
      const rawBalance = await this.repo.balanceSince(tx, userId, cycleStart);
      const quota = PLAN_QUOTAS[tier];
      const shownBalance = Math.max(rawBalance, 0);
      return {
        tier,
        rawBalance,
        quota,
        percentRemaining: quota > 0 ? Math.min(Math.round((shownBalance / quota) * 100), 100) : 0,
        publicationsRemaining: unitsToPublications(shownBalance),
        renewsAt,
      };
    });
  }

  /**
   * Bajo advisory lock (lockUser ya tomado por el caller): si el ciclo
   * vigente todavía no tiene su `monthly_grant`, liquida el anterior
   * (`cycle_expiration` si sobraba saldo, `adjustment` si sobregiró) y
   * otorga la cuota nueva. Reemplaza temporalmente al job de pg-boss de F8
   * (modelo-de-datos.md:124) — vive aquí para que el ciclo funcione antes
   * de que exista el worker; F8 solo cambia el disparador (cron en vez de
   * "alguien pidió su saldo"), no esta lógica.
   */
  private async ensureCurrentCycle(
    tx: Tx,
    userId: string,
  ): Promise<{ tier: PlanTier; cycleStart: Date; renewsAt: Date }> {
    const user = await this.repo.findUserForCycle(tx, userId);
    if (!user) throw new Error(`Usuario ${userId} no encontrado para calcular su ciclo de cuota`);

    const { start, end } = currentCycleWindow(user.createdAt, new Date());
    const lastGrant = await this.repo.lastGrant(tx, userId);

    if (!lastGrant || lastGrant.createdAt < start) {
      if (lastGrant) {
        const priorBalance = await this.repo.balanceSince(tx, userId, lastGrant.createdAt);
        if (priorBalance > 0) {
          await this.repo.insertEntry(tx, {
            userId,
            delta: -priorBalance,
            reason: "cycle_expiration",
            rateCardVersion: CURRENT_RATE_CARD_VERSION,
          });
        } else if (priorBalance < 0) {
          // Perdón del sobregiro al cerrar ciclo: el ledger sigue siendo
          // fiel al costo real (registrado por charge()), pero el pasivo
          // no cruza al ciclo siguiente.
          await this.repo.insertEntry(tx, {
            userId,
            delta: -priorBalance,
            reason: "adjustment",
            rateCardVersion: CURRENT_RATE_CARD_VERSION,
          });
        }
      }
      await this.repo.insertEntry(tx, {
        userId,
        delta: PLAN_QUOTAS[user.planTier],
        reason: "monthly_grant",
        rateCardVersion: CURRENT_RATE_CARD_VERSION,
      });
    }

    return { tier: user.planTier, cycleStart: start, renewsAt: end };
  }
}
