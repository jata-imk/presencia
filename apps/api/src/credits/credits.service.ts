import { Inject, Injectable } from "@nestjs/common";
import type { QuotaState, QuotaStatusDto } from "@presencia/shared";
import type { AiTaskKind } from "../ai/provider-registry.js";
import { DbService, type Tx } from "../db/db.service.js";
import { CreditsRepository } from "./credits.repository.js";
import { currentCycleWindow } from "./cycle.js";
import { summarizeFailures } from "../jobs/summarize-failures.js";
import { InsufficientQuotaError, UserGoneError } from "./errors.js";
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
    const { cycleStartId } = await this.ensureCurrentCycle(tx, input.userId);
    const balance = await this.repo.balanceFrom(tx, input.userId, cycleStartId);
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
      const { tier, cycleStartId, renewsAt } = await this.ensureCurrentCycle(tx, userId);
      const rawBalance = await this.repo.balanceFrom(tx, userId, cycleStartId);
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
   * La versión que sale por HTTP: nunca crudo, siempre el objeto contable
   * (addendum ADR-012). La consumen tanto el endpoint GET /api/me/quota
   * como el 402 del gate de chat — un solo lugar decide los umbrales de
   * "low"/"critical"/"exhausted".
   */
  async getQuotaStatusDto(userId: string): Promise<QuotaStatusDto> {
    const status = await this.getQuotaStatus(userId);
    return {
      tier: status.tier,
      percentRemaining: status.percentRemaining,
      publicationsRemaining: status.publicationsRemaining,
      renewsAt: status.renewsAt.toISOString(),
      state: quotaStateFromPercent(status.percentRemaining),
    };
  }

  /**
   * El disparador del job diario (F8). Adelanta el asiento del ciclo para un
   * usuario que no ha entrado: sin esto, el `monthly_grant` de alguien que no
   * abre la app en dos meses no existe hasta que abra.
   *
   * NO reemplaza a la ruta perezosa, y la distinción importa: `charge()` y
   * `spend()` siguen llamando a `ensureCurrentCycle` dentro de SU transacción,
   * bajo el mismo advisory lock, y eso es lo que garantiza la corrección
   * contable. El cron solo adelanta trabajo; si llega tarde, el primer cobro
   * lo hace igual y con el mismo resultado.
   */
  async refreshCycle(userId: string): Promise<void> {
    await this.dbService.runWithTenant(userId, async (tx) => {
      // Sin esperar: si el usuario está ocupado en otra transacción, el pase
      // sigue de largo (ver tryLockUser). Adelantar un asiento no vale trabar
      // el pase entero detrás de un request.
      if (!(await this.repo.tryLockUser(tx, userId))) return;
      await this.ensureCurrentCycle(tx, userId);
    });
  }

  /**
   * El pase completo del job diario. Vive acá y no en `CreditsJobs` para que
   * el módulo no tenga que exportar el repositorio: cualquiera que importara
   * `CreditsModule` podría entonces inyectarlo y llamar `insertEntry` directo,
   * saltándose la disciplina de `lockUser` + `ensureCurrentCycle` que es el
   * motivo de existir de este servicio. `CardsJobs` ya seguía este patrón.
   *
   * Solo usuarios con correo verificado: una cuenta sin verificar no puede
   * entrar (el gate de F1), así que adelantarle el ciclo solo le escribiría
   * asientos a una cuenta que nunca va a gastar — y el ledger es append-only
   * por el motor desde la migración 0008, así que esas filas no se limpian
   * después. Si algún día verifica, la ruta perezosa se lo otorga en su primer
   * acceso.
   */
  async refreshAllCycles(): Promise<void> {
    const userIds = await this.dbService.runWorkerScan((tx) => this.repo.listVerifiedUserIds(tx));

    // El try/catch por usuario existe para que el fallo de uno no deje sin
    // ciclo a los demás; el relanzado del final, para que el pase no mienta
    // sobre cómo le fue — si se traga todo, pg-boss registra "completed" y un
    // fallo durable se repite cada día sin más señal que un log.
    const failed: string[] = [];
    for (const userId of userIds) {
      try {
        await this.refreshCycle(userId);
      } catch (error) {
        // Una cuenta borrada entre la enumeración y su turno no es un fallo.
        if (error instanceof UserGoneError) continue;
        failed.push(userId);
        console.error(`[credits] No se pudo refrescar el ciclo de ${userId}:`, error);
      }
    }
    if (failed.length > 0) throw new Error(summarizeFailures("El ciclo mensual", failed));
  }

  /**
   * Bajo advisory lock (lockUser ya tomado por el caller): si el ciclo
   * vigente todavía no tiene su `monthly_grant`, liquida el anterior
   * (`cycle_expiration` si sobraba saldo, `adjustment` si sobregiró) y
   * otorga la cuota nueva. El disparador puede ser perezoso (alguien pidió su
   * saldo o gastó) o el cron diario de F8 (`refreshCycle`) — el cálculo es el
   * mismo y es idempotente, que es lo que permite tener los dos.
   */
  private async ensureCurrentCycle(
    tx: Tx,
    userId: string,
  ): Promise<{ tier: PlanTier; cycleStartId: number; renewsAt: Date }> {
    const user = await this.repo.findUserForCycle(tx, userId);
    if (!user) throw new UserGoneError(userId);

    const { start, end } = currentCycleWindow(user.createdAt, new Date());
    const lastGrant = await this.repo.lastGrant(tx, userId);

    // cycleStartId ancla el saldo al asiento monthly_grant vigente, nunca a
    // una fecha — ver el comentario de balanceFrom (CreditsRepository) sobre
    // por qué created_at no sirve para esto dentro de la misma transacción.
    let cycleStartId = lastGrant?.id;

    if (!lastGrant || lastGrant.createdAt < start) {
      if (lastGrant) {
        // Por id, no por created_at: el lastGrant de un ciclo previo pudo
        // haberse insertado junto a SU PROPIO cycle_expiration/adjustment en
        // la misma transacción (mismo problema, un nivel atrás) — balanceFrom
        // ya excluye esos hermanos porque tienen id menor.
        const priorBalance = await this.repo.balanceFrom(tx, userId, lastGrant.id);
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
      const grant = await this.repo.insertEntry(tx, {
        userId,
        delta: PLAN_QUOTAS[user.planTier],
        reason: "monthly_grant",
        rateCardVersion: CURRENT_RATE_CARD_VERSION,
      });
      cycleStartId = grant.id;
    }

    if (cycleStartId === undefined) {
      throw new Error(`No se pudo determinar el ciclo de cuota de ${userId}`);
    }
    return { tier: user.planTier, cycleStartId, renewsAt: end };
  }
}

// Umbrales de presentación (ADR-012 addendum, presencia-chat.md §4): banner
// sutil bajo 20%, banner urgente bajo 10%, modal bloqueante en 0. Viven
// aquí, no en rate-card.ts — son UX, no economía del rate card.
export function quotaStateFromPercent(percentRemaining: number): QuotaState {
  if (percentRemaining <= 0) return "exhausted";
  if (percentRemaining < 10) return "critical";
  if (percentRemaining < 20) return "low";
  return "ok";
}
