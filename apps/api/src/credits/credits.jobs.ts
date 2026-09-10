import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { CreditsService } from "./credits.service.js";

// Diario a las 09:00 UTC (03:00 en Mérida): la hora exacta da igual porque el
// ciclo de cada usuario está anclado al aniversario de su alta, no a un corte
// global del mes. Lo único que fija la cadencia es cuánto puede tardar el
// asiento de un usuario dormido en aparecer, y un día es de sobra — el que
// entra antes lo dispara solo por la ruta perezosa.
const JOB_QUEUE = "credits.cycle";
const CYCLE_CRON = "0 9 * * *";

// Techo del pase, explícito. Una hora es holgado para un pase serial y sigue
// siendo una cota de verdad (ver RecurringJob.expireInSeconds por qué NO se
// puede dejar el default).
const CYCLE_EXPIRE_SECONDS = 60 * 60;

/**
 * Adelanta el ciclo mensual de crédito (F8, ADR-012). El pase entero vive en
 * `CreditsService.refreshAllCycles`; esto solo lo agenda.
 *
 * No sustituye a la ruta perezosa: `charge()` y `spend()` siguen llamando a
 * `ensureCurrentCycle` dentro de su transacción, y eso es lo que garantiza que
 * un cobro nunca ocurra sobre un ciclo sin liquidar. Este job existe para que
 * el `monthly_grant` de alguien que no abre la app en dos meses no dependa de
 * que la abra.
 */
@Injectable()
export class CreditsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(CreditsService) private readonly credits: CreditsService,
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
      cron: CYCLE_CRON,
      expireInSeconds: CYCLE_EXPIRE_SECONDS,
      handler: () => this.credits.refreshAllCycles(),
    });
  }
}
