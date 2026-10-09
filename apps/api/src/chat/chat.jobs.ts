import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  COMPACTION_EXPIRE_SECONDS,
  COMPACTION_QUEUE,
  HistoryCompactionService,
  type CompactionJob,
} from "./history-compaction.service.js";

/**
 * El consumidor de la cola de compactación (F10.8). La lógica vive entera en
 * HistoryCompactionService; esto solo la registra.
 *
 * `retryLimit` implícito en 0, como el resto de las colas: si falla, el turno
 * siguiente que pase del umbral la vuelve a encolar, y mientras tanto el techo
 * mecánico (history-window.ts) acota lo que viaja al modelo.
 */
@Injectable()
export class ChatJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(HistoryCompactionService) private readonly compaction: HistoryCompactionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Mismo criterio que ImagesJobs: fatal en el worker, tolerado en la API.
    try {
      await this.boss.registerOnDemand<CompactionJob>({
        queue: COMPACTION_QUEUE,
        expireInSeconds: COMPACTION_EXPIRE_SECONDS,
        handler: (data) => this.compaction.compact(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${COMPACTION_QUEUE} no quedó escuchando; la API sigue sin él:`, error);
    }
  }
}
