import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import {
  MANUAL_REFRESH_EXPIRE_SECONDS,
  MANUAL_REFRESH_QUEUE,
  TrendsService,
  type CobroDeRefresco,
} from "./trends.service.js";

/** Lo que viaja en el job del refresco manual. */
type ManualRefreshJob = CobroDeRefresco & { userId: string };

// Un pase al día, y la cadencia no la fija cuánto cambian las tendencias —eso
// lo fija el TTL de 7 días de cada tanda— sino cuánto puede tardar en llegar
// la PRIMERA tanda de alguien.
//
// Con el TTL semanal, un pase diario significa que cada usuario se refresca
// una vez por semana y que uno nuevo espera como mucho un día para ver algo.
// Pases más frecuentes no adelantarían nada: un pase solo trabaja sobre lo que
// ya venció, y lo que ya se refrescó lo salta sin tocar la red.
//
// El presupuesto real lo pone USUARIOS_POR_PASE (trends.service.ts), no el
// cron: es lo que evita que el día que se acumulen muchos vencimientos el
// gasto llegue de golpe.

const JOB_QUEUE = "trends.refresh";
const REFRESH_CRON = "15 5 * * *";

// Peor caso del pase: 20 usuarios × 2 llamadas, y la de búsqueda puede tardar
// decenas de segundos porque el proveedor navega de verdad. 25 minutos deja
// margen y queda muy por debajo de las 24 horas entre pases, que es lo que
// impide que dos se encimen sobre la misma API key.
//
// pg-boss NO mata al handler cuando expira: marca el job como fallido y libera
// el slot. Un expire corto no cancelaría la búsqueda, solo dejaría que el pase
// siguiente arrancara encima.
const REFRESH_EXPIRE_SECONDS = 25 * 60;

/**
 * El disparador del refresco de tendencias (F9.6). La lógica vive entera en
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
    // El refresco que el usuario adelanta (F9.6). Va por cola y no por el
    // request porque la búsqueda tarda decenas de segundos: contestar en
    // línea sería tener el request abierto todo ese rato, a merced del
    // timeout del nginx de enfrente.
    //
    // `retryLimit` implícito en 0, como el resto: un reintento acá no es
    // gratis ni idempotente — vuelve a pagar la búsqueda con grounding, que
    // es justo lo que se está cobrando.
    await this.boss.registerOnDemand<ManualRefreshJob>({
      queue: MANUAL_REFRESH_QUEUE,
      expireInSeconds: MANUAL_REFRESH_EXPIRE_SECONDS,
      handler: (data) => this.trends.atenderRefrescoManual(data),
    });
  }
}
