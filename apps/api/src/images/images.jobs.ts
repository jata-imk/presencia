import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";

/** Trabajos de imagen en paralelo por proceso (ver la cola abajo). */
const IMAGE_QUEUE_CONCURRENCY = 4;
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
 * no es gratis — vuelve a pagarle al generador. Una imagen que falla se
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
        // De a uno, una fila de tres o cuatro "Generar" en el mismo minuto
        // (cada uno hasta ~2 min con gpt-image) dejaba al último esperando
        // más que el corte de 5 min: la card lo mostraba fallido mientras
        // seguía en la cola. Casi todo el trabajo es esperar al generador,
        // así que correr varios no le cuesta al worker.
        localConcurrency: IMAGE_QUEUE_CONCURRENCY,
        handler: (data) => this.images.run(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${IMAGE_QUEUE} no quedó escuchando; la API sigue sin él:`, error);
    }
  }
}
