import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { BossService } from "../jobs/boss.service.js";
import { CardsService } from "./cards.service.js";

// Cada minuto. Cuando no hay nada vencido el pase cuesta UNA query y cero red
// (`getPostStates` solo se llama si hay refs), así que la cadencia la fija la
// latencia que queremos, no el costo: una card publicada aparece como tal
// dentro del minuto siguiente a que se cumpla el margen de gracia.
const RECONCILE_CRON = "* * * * *";

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
    await this.boss.registerRecurring({
      queue: "cards.reconcile",
      cron: RECONCILE_CRON,
      handler: () => this.cards.reconcileAll(),
    });
  }
}
