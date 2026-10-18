import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { AttachmentsService } from "./attachments.service.js";

export const ATTACHMENTS_CLEANUP_QUEUE = "attachments.cleanup";

/**
 * El barrido de adjuntos que nunca se enviaron (F10.9): cada hora borra los
 * que llevan más de un día sin mensaje. Sin reintentos: el reintento es el
 * tick siguiente, y lo que no alcanzó a borrar sigue ahí para él.
 */
@Injectable()
export class AttachmentsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.boss.registerRecurring({
        queue: ATTACHMENTS_CLEANUP_QUEUE,
        cron: "17 * * * *",
        expireInSeconds: 10 * 60,
        handler: async () => {
          const deleted = await this.attachments.cleanupUnsent();
          if (deleted > 0) console.log(`[adjuntos] ${deleted} sin enviar borrados.`);
        },
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${ATTACHMENTS_CLEANUP_QUEUE} no se agendó; la API sigue sin él:`, error);
    }
  }
}
