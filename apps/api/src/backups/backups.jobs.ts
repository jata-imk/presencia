import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { pingHealthcheck } from "../ops/healthchecks.js";
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
          // El ping a Healthchecks (F12.8, ADR-031) es lo que detecta el
          // backup que NO corrió: si el worker no arrancó, este handler ni
          // existe, y la ausencia del ping es la alerta. El que truena le
          // pega a /fail para avisar de una vez, y relanza igual: la fila
          // `failed` en pgboss.job la ve también `ops.watch`.
          const inicio = Date.now();
          try {
            const { key } = await this.backups.runDailyBackup(config);
            console.info(`[jobs] ${JOB_QUEUE}: subido ${key}`);
            // pg-boss no mata al handler al expirar: lo marca `failed` y lo
            // deja seguir. Un dump que termina después de eso no manda el
            // "todo bien", o Healthchecks diría verde mientras ops.watch
            // avisa del mismo pase como fallido.
            if (Date.now() - inicio > BACKUP_EXPIRE_SECONDS * 1000) {
              console.warn(`[jobs] ${JOB_QUEUE}: terminó después de expirar; sin ping de éxito`);
            } else {
              await pingHealthcheck(env.HEALTHCHECK_BACKUP_URL);
            }
          } catch (error) {
            await pingHealthcheck(env.HEALTHCHECK_BACKUP_URL, true);
            throw error;
          }
        },
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${JOB_QUEUE} no quedó agendado; la API sigue sin él:`, error);
    }
  }
}
