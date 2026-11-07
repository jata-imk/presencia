import { Injectable } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Tx } from "../db/db.service.js";
import { aiUsageEvents, publicationCards } from "../db/schema.js";

export interface MotivoDeFallo {
  reason: string | null;
  n: number;
}

export interface CardsFallidas {
  motivos: MotivoDeFallo[];
  creadores: number;
}

export interface EventoDeUso {
  provider: string;
  model: string;
  fallbackFrom: string | null;
  /** `provider_raw.attempts`, tal como lo guardó AiUsageService (o null). */
  attempts: unknown;
}

/**
 * Las lecturas cross-tenant de `ops.watch` (F12.8, ADR-031). Corren en
 * `DbService.runWorkerScan`: las permiten las policies `worker_ops_scan` de la
 * migración 0065, acotadas a las últimas 2 h. Solo cuentan; no escriben.
 */
@Injectable()
export class OpsScanRepository {
  /**
   * Cards que pasaron a `failed` desde `desde` (por `failed_at`), agrupadas
   * por motivo, y de cuántos creators distintos son. El motivo es `reason`
   * (lo pone la reconciliación) o, si no hay, `message` (lo pone
   * `markFailed` cuando el proveedor rechazó la programación): justo el caso
   * que este chequeo existe para ver no puede salir "(sin motivo)".
   */
  async cardsFallidas(tx: Tx, desde: Date): Promise<CardsFallidas> {
    const motivo = sql<
      string | null
    >`coalesce(${publicationCards.errorDetail}->>'reason', ${publicationCards.errorDetail}->>'message')`;
    const filtro = and(eq(publicationCards.status, "failed"), gt(publicationCards.failedAt, desde));
    const motivos = await tx
      .select({ reason: motivo, n: sql<number>`count(*)::int` })
      .from(publicationCards)
      .where(filtro)
      .groupBy(motivo);
    const [fila] = await tx
      .select({ n: sql<number>`count(distinct ${publicationCards.userId})::int` })
      .from(publicationCards)
      .where(filtro);
    return { motivos, creadores: fila?.n ?? 0 };
  }

  /** Los eventos de uso de IA desde `desde`, solo lo que miran los chequeos. */
  async usoReciente(tx: Tx, desde: Date): Promise<EventoDeUso[]> {
    return tx
      .select({
        provider: aiUsageEvents.provider,
        model: aiUsageEvents.model,
        fallbackFrom: aiUsageEvents.fallbackFrom,
        attempts: sql<unknown>`${aiUsageEvents.providerRaw}->'attempts'`,
      })
      .from(aiUsageEvents)
      .where(gt(aiUsageEvents.createdAt, desde));
  }
}
