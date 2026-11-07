import { Injectable } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Tx } from "../db/db.service.js";
import { aiUsageEvents, publicationCards } from "../db/schema.js";

export interface MotivoDeFallo {
  reason: string | null;
  n: number;
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
  /** Cards que pasaron a `failed` desde `desde`, agrupadas por motivo. */
  async cardsFallidas(tx: Tx, desde: Date): Promise<MotivoDeFallo[]> {
    const motivo = sql<string | null>`${publicationCards.errorDetail}->>'reason'`;
    return tx
      .select({ reason: motivo, n: sql<number>`count(*)::int` })
      .from(publicationCards)
      .where(and(eq(publicationCards.status, "failed"), gt(publicationCards.updatedAt, desde)))
      .groupBy(motivo);
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
