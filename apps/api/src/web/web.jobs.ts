import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  WEB_READ_DIGEST_EXPIRE_SECONDS,
  WEB_READ_DIGEST_QUEUE,
  WebReadDigestService,
  type WebReadDigestJob,
} from "./web-read-digest.service.js";

/**
 * La cola de lo que el chat lee de la web (F10.10): la descripción de cada
 * página (web-read-digest.service.ts). Dos reintentos, como la de los
 * adjuntos: sin descripción, la página vieja viaja solo como su título.
 */
@Injectable()
export class WebJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(WebReadDigestService) private readonly digests: WebReadDigestService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.boss.registerOnDemand<WebReadDigestJob>({
        queue: WEB_READ_DIGEST_QUEUE,
        retryLimit: 2,
        expireInSeconds: WEB_READ_DIGEST_EXPIRE_SECONDS,
        handler: (data) => this.digests.describe(data),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(
        `[jobs] ${WEB_READ_DIGEST_QUEUE} no quedó lista; la API sigue sin ella:`,
        error,
      );
    }
  }
}
