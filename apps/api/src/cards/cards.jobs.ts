import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { CardsService } from "./cards.service.js";

// Cada minuto. Cuando no hay nada vencido el pase cuesta UNA query y cero red
// (`getPostStates` solo se llama si hay refs), así que la cadencia la fija la
// latencia que queremos, no el costo: una card publicada aparece como tal
// dentro del minuto siguiente a que se cumpla el margen de gracia.
const JOB_QUEUE = "cards.reconcile";
const RECONCILE_CRON = "* * * * *";

// Techo del pase, explícito. Diez minutos son dos órdenes de magnitud más que
// un pase normal y siguen siendo una cota real (ver
// RecurringJob.expireInSeconds por qué el default de pg-boss no sirve).
const RECONCILE_EXPIRE_SECONDS = 10 * 60;

/**
 * El disparador de la reconciliación (F8, ADR-009: "F8 solo cambia el
 * disparador"). La lógica vive entera en CardsService; esto solo la agenda.
 *
 * OnApplicationBootstrap y no OnModuleInit: pg-boss tiene que haber arrancado
 * (BossService lo hace en SU OnModuleInit) antes de que se pueda registrar
 * una cola.
 */
@Injectable()
export class CardsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(CardsService) private readonly cards: CardsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // En el worker un fallo acá es fatal: un proceso vivo sin jobs registrados
    // se reporta sano y no hace nada. En la API no, porque el módulo de jobs
    // cuelga de AppModule y relanzar abortaría NestFactory.create entero (el
    // arranque de pg-boss aplica el mismo criterio, ver BossService).
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
      cron: RECONCILE_CRON,
      expireInSeconds: RECONCILE_EXPIRE_SECONDS,
      handler: () => this.cards.reconcileAll(),
    });
  }
}
