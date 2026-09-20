import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { MetricsService } from "./metrics.service.js";

// Cada 6 horas. La cadencia NO la fija lo que queremos ver, la fija lo que
// hay para ver: las redes reportan con horas de retraso (Instagram hasta 48 h
// según su propia doc) y los proveedores refrescan cada 6 h ellos mismos
// —PostFast lo documenta—, así que preguntar más seguido gasta cuota para
// traer el mismo número.
//
// Y la cuota importa de verdad acá: Upload-Post pide UNA request por post
// contra un tope de 100 cada 5 minutos, con la misma API key que usa la
// reconciliación cada minuto.
const JOB_QUEUE = "metrics.ingest";
const INGEST_CRON = "0 */6 * * *";

// Techo del pase. Más generoso que el de reconciliación porque este sí hace
// red por post.
//
// El peor caso sale del presupuesto de POSTS_POR_PASE (60, del pase entero y
// no por usuario): 60 requests secuenciales con el timeout de 30 s del
// cliente HTTP. Si ese presupuesto sube, esto sube con él — pg-boss no mata
// al handler cuando expira, solo marca el job como fallido y libera el slot
// `exclusive`, así que un expire corto de más deja dos pases corriendo
// encima (ver RecurringJob.expireInSeconds en boss.service.ts).
const INGEST_EXPIRE_SECONDS = 30 * 60;

/**
 * El disparador de la ingesta de métricas (F8.7). La lógica vive entera en
 * MetricsService; esto solo la agenda.
 *
 * OnApplicationBootstrap y no OnModuleInit: pg-boss tiene que haber arrancado
 * (BossService lo hace en SU OnModuleInit) antes de registrar una cola.
 */
@Injectable()
export class MetricsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // En el worker un fallo acá es fatal: un proceso vivo sin jobs
    // registrados se reporta sano y no hace nada. En la API no, porque el
    // módulo de jobs cuelga de AppModule y relanzar abortaría
    // NestFactory.create entero (mismo criterio que CardsJobs).
    try {
      await this.register();
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${JOB_QUEUE} no quedó agendado; la API sigue sin él:`, error);
    }
  }

  private async register(): Promise<void> {
    await this.boss.registerRecurring({
      queue: JOB_QUEUE,
      cron: INGEST_CRON,
      expireInSeconds: INGEST_EXPIRE_SECONDS,
      handler: () => this.metrics.ingestAll(),
    });
  }
}
