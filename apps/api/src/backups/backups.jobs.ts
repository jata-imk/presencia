import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { BackupsService, readBackupConfig } from "./backups.service.js";

// Diario a las 08:00 UTC (02:00 en Mérida): la hora más muerta del día para un
// producto de creators, y el dump compite con el tráfico por el mismo disco.
const JOB_QUEUE = "backups.daily";
const BACKUP_CRON = "0 8 * * *";

// Techo del pase. Media hora es mucho más de lo que tarda un dump de esta base
// —hoy son megabytes— y sigue siendo una cota real: si algo se cuelga, pg-boss
// lo da por muerto en vez de dejarlo colgado hasta el día siguiente.
const BACKUP_EXPIRE_SECONDS = 30 * 60;

/**
 * El respaldo diario (ADR-011). Solo se agenda si el entorno trae la
 * configuración completa: en dev nadie tiene bucket, y la API no tiene por qué
 * negarse a arrancar por eso.
 */
@Injectable()
export class BackupsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(BackupsService) private readonly backups: BackupsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const config = readBackupConfig();
    if (!config) {
      console.info(`[jobs] ${JOB_QUEUE} no se agenda: el entorno no trae la config de S3.`);
      return;
    }

    // Mismo criterio que los otros jobs: en el worker un fallo al registrar es
    // fatal (un proceso vivo sin jobs se reporta sano y no hace nada); en la
    // API se registra y se sigue.
    try {
      await this.boss.registerRecurring({
        queue: JOB_QUEUE,
        cron: BACKUP_CRON,
        expireInSeconds: BACKUP_EXPIRE_SECONDS,
        handler: async () => {
          const { key } = await this.backups.runDailyBackup(config);
          console.info(`[jobs] ${JOB_QUEUE}: subido ${key}`);
        },
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${JOB_QUEUE} no quedó agendado; la API sigue sin él:`, error);
    }
  }
}
