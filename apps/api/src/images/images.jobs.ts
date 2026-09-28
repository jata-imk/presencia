import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  IMAGE_JOB_EXPIRE_SECONDS,
  IMAGE_QUEUE,
  ImageGenerationService,
  type ImageGenerationJob,
} from "./image-generation.service.js";

/**
 * El consumidor de la cola de imágenes (F10). La lógica vive entera en
 * ImageGenerationService; esto solo la registra.
 *
 * `retryLimit` implícito en 0, como el resto de las colas: un reintento acá
 * no es gratis — vuelve a pagarle al generador. Una variante que falla se
 * reintenta a mano, desde la card.
 */
@Injectable()
export class ImagesJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(ImageGenerationService) private readonly images: ImageGenerationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Mismo criterio que TrendsJobs: fatal en el worker, tolerado en la API.
    try {
      await this.boss.registerOnDemand<ImageGenerationJob>({
        queue: IMAGE_QUEUE,
        expireInSeconds: IMAGE_JOB_EXPIRE_SECONDS,
        handler: (data) => this.images.run(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${IMAGE_QUEUE} no quedó escuchando; la API sigue sin él:`, error);
    }
  }
}
