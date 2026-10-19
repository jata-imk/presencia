import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  ATTACHMENT_DIGEST_EXPIRE_SECONDS,
  ATTACHMENT_DIGEST_QUEUE,
  AttachmentDigestService,
  type AttachmentDigestJob,
} from "./attachment-digest.service.js";
import { AttachmentsService } from "./attachments.service.js";

export const ATTACHMENTS_CLEANUP_QUEUE = "attachments.cleanup";

/**
 * Las colas de los adjuntos (F10.9):
 * - el barrido de los que nunca se enviaron: cada hora borra los que llevan
 *   más de un día sin mensaje. Sin reintentos: el reintento es el tick
 *   siguiente, y lo que no alcanzó a borrar sigue ahí para él;
 * - la descripción de cada adjunto enviado (attachment-digest.service.ts).
 */
@Injectable()
export class AttachmentsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(AttachmentDigestService) private readonly digests: AttachmentDigestService,
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
      // F10.9 PR4: dos reintentos. Una descripción que no salió deja al
      // adjunto viajar como su principio o su nombre, que es peor contexto:
      // vale la pena insistir un poco (cada intento cuesta centavos).
      await this.boss.registerOnDemand<AttachmentDigestJob>({
        queue: ATTACHMENT_DIGEST_QUEUE,
        retryLimit: 2,
        expireInSeconds: ATTACHMENT_DIGEST_EXPIRE_SECONDS,
        handler: (data) => this.digests.describe(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(
        `[jobs] ${ATTACHMENTS_CLEANUP_QUEUE}/${ATTACHMENT_DIGEST_QUEUE} no quedaron listos; la API sigue sin ellos:`,
        error,
      );
    }
  }
}
