import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  COMPACTION_EXPIRE_SECONDS,
  COMPACTION_QUEUE,
  HistoryCompactionService,
  type CompactionJob,
} from "./history-compaction.service.js";
import {
  MEMORY_INDEX_EXPIRE_SECONDS,
  MEMORY_INDEX_QUEUE,
  MemoryService,
  type MemoryIndexJob,
} from "./memory.service.js";

/**
 * Los consumidores de las colas del chat (F10.8): la compactación y el
 * indexado de la memoria. La lógica vive en HistoryCompactionService y
 * MemoryService; esto solo las registra.
 *
 * `retryLimit` implícito en 0, como el resto de las colas. Una compactación
 * que falla se vuelve a encolar en el siguiente turno que pase del umbral, y
 * mientras tanto el techo mecánico (history-window.ts) acota lo que viaja al
 * modelo.
 */
@Injectable()
export class ChatJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(HistoryCompactionService) private readonly compaction: HistoryCompactionService,
    @Inject(MemoryService) private readonly memory: MemoryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Mismo criterio que ImagesJobs: fatal en el worker, tolerado en la API.
    try {
      await this.boss.registerOnDemand<CompactionJob>({
        queue: COMPACTION_QUEUE,
        expireInSeconds: COMPACTION_EXPIRE_SECONDS,
        handler: (data) => this.compaction.compact(data),
      });
      // Sin reintentos, como el resto: un intercambio que no se indexó solo
      // falta en la memoria, y `memoria:reindexar` lo recupera.
      await this.boss.registerOnDemand<MemoryIndexJob>({
        queue: MEMORY_INDEX_QUEUE,
        expireInSeconds: MEMORY_INDEX_EXPIRE_SECONDS,
        handler: (data) => this.memory.index(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(
        `[jobs] ${COMPACTION_QUEUE}/${MEMORY_INDEX_QUEUE} no quedaron escuchando; la API sigue sin ellas:`,
        error,
      );
    }
  }
}
