import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
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
    // Un fallo acá NO debe tumbar el arranque. Con WORKER_INLINE el módulo de
    // jobs cuelga de AppModule, así que una excepción en el bootstrap aborta
    // NestFactory.create y la API entera se niega a levantar — el caso real es
    // arrancar `pnpm dev` con el túnel al VPS todavía abajo. Es preferible una
    // API viva sin cron (el barrido perezoso sigue cubriendo) que ninguna API.
    try {
      await this.register();
    } catch (error) {
      console.error(`[jobs] No se pudo agendar ${JOB_QUEUE}. La cola NO está corriendo:`, error);
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
