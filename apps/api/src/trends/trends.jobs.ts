import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import type { TuplaDeTendencias } from "./trends.repository.js";
import { COLA_SEMILLA, SEMILLA_EXPIRE_SECONDS, TrendsService } from "./trends.service.js";

// Cada seis horas, y la cadencia no la fija cuánto cambian las tendencias
// —eso lo fija el TTL de 24 h de cada tanda— sino cuánto puede tardar una
// tanda vencida en refrescarse.
//
// Con un pase diario, una tupla que vence a las 09:05 espera casi 24 horas; el
// usuario que abra Ritmo a las 10:00 ve datos de anteayer. Con cuatro pases,
// el peor caso baja a seis horas y el gasto no sube: un pase solo trabaja
// sobre lo que YA venció, y lo que ya se refrescó lo salta sin tocar la red.
//
// El presupuesto real lo pone TUPLAS_POR_PASE (trends.service.ts), no el cron.

const JOB_QUEUE = "trends.refresh";
const REFRESH_CRON = "15 */6 * * *";

// Peor caso del pase: 8 tuplas × 2 llamadas, y la de búsqueda puede tardar
// decenas de segundos porque el proveedor navega de verdad. 10 minutos deja
// margen de sobra y queda muy por debajo de las 6 horas entre pases, que es lo
// que impide que dos pases se encimen sobre la misma API key.
//
// pg-boss NO mata al handler cuando expira: marca el job como fallido y libera
// el slot. Un expire corto no cancelaría la búsqueda, solo dejaría que el pase
// siguiente arrancara encima.
const REFRESH_EXPIRE_SECONDS = 10 * 60;

/**
 * El disparador del refresco de tendencias (F9). La lógica vive entera en
 * TrendsService; esto solo la agenda.
 *
 * OnApplicationBootstrap y no OnModuleInit: pg-boss tiene que haber arrancado
 * (BossService lo hace en SU OnModuleInit) antes de registrar una cola.
 */
@Injectable()
export class TrendsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(TrendsService) private readonly trends: TrendsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // En el worker un fallo acá es fatal: un proceso vivo sin jobs
    // registrados se reporta sano y no hace nada. En la API no, porque el
    // módulo de jobs cuelga de AppModule y relanzar abortaría
    // NestFactory.create entero (mismo criterio que MetricsJobs).
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
      cron: REFRESH_CRON,
      expireInSeconds: REFRESH_EXPIRE_SECONDS,
      handler: () => this.trends.barrer(),
    });
    // La cola de la PRIMERA búsqueda, que encola el camino de lectura. El
    // barrido periódico no puede cubrir esto: solo refresca filas que ya
    // existen, así que una tupla nueva no entraría nunca a su pase.
    await this.boss.registerOnDemand<TuplaDeTendencias>({
      queue: COLA_SEMILLA,
      expireInSeconds: SEMILLA_EXPIRE_SECONDS,
      handler: async (tupla) => {
        await this.trends.refrescarSiHaceFalta(tupla);
      },
    });
  }
}
