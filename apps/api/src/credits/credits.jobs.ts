import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DbService } from "../db/db.service.js";
import { BossService } from "../jobs/boss.service.js";
import { CreditsRepository } from "./credits.repository.js";
import { CreditsService } from "./credits.service.js";

// Diario a las 09:00 UTC (03:00 en Mérida): la hora exacta da igual porque el
// ciclo de cada usuario está anclado al aniversario de su alta, no a un corte
// global del mes. Lo único que fija la cadencia es cuánto puede tardar el
// asiento de un usuario dormido en aparecer, y un día es de sobra — el que
// entra antes lo dispara solo por la ruta perezosa.
const CYCLE_CRON = "0 9 * * *";

/**
 * Adelanta el ciclo mensual de crédito de todos los usuarios (F8, ADR-012).
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
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CreditsRepository) private readonly repo: CreditsRepository,
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.registerRecurring({
      queue: "credits.cycle",
      cron: CYCLE_CRON,
      handler: () => this.refreshAllCycles(),
    });
  }

  async refreshAllCycles(): Promise<void> {
    const userIds = await this.dbService.runWorkerScan((tx) => this.repo.listAllUserIds(tx));

    // Mismo criterio que el barrido de cards: el fallo de un usuario no debe
    // dejar sin ciclo a los demás, pero el pase tampoco debe mentir sobre cómo
    // le fue — si se traga todo, pg-boss registra "completed" y un fallo
    // durable se repite cada día sin más señal que un log.
    const failed: string[] = [];
    for (const userId of userIds) {
      try {
        await this.credits.refreshCycle(userId);
      } catch (error) {
        failed.push(userId);
        console.error(`[credits] No se pudo refrescar el ciclo de ${userId}:`, error);
      }
    }
    if (failed.length > 0) {
      throw new Error(
        `El ciclo mensual falló para ${failed.length} usuario(s): ${failed.join(", ")}`,
      );
    }
  }
}
