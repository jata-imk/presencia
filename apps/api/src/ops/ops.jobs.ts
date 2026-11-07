import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { enProcesoWorker } from "../jobs/process-role.js";
import { DbService } from "../db/db.service.js";
import {
  chequeoDeCards,
  chequeoDeJobs,
  chequeoDeIa,
  llavesDeJobs,
  VENTANA_FALLOS_MIN,
  VENTANA_RECIENTE_MIN,
  type ResultadoDeIa,
} from "./chequeos.js";
import { pingHealthcheck } from "./healthchecks.js";
import { OpsAlertsService, type Chequeo } from "./ops-alerts.service.js";
import { OpsScanRepository } from "./ops-scan.repository.js";

// Cada cinco minutos: lo bastante seguido para que "un fallo produce un aviso
// en minutos" (DoD de F12.8) sea cierto, y lo bastante espaciado para que el
// pase —unas pocas queries— no se note. El latido a Healthchecks hereda esta
// cadencia: allá el check se configura con periodo de 5 min.
const WATCH_QUEUE = "ops.watch";
const WATCH_CRON = "*/5 * * * *";
// Por debajo de la cadencia: un pase que tarda más de 4 minutos está colgado.
const WATCH_EXPIRE_SECONDS = 4 * 60;

/**
 * Las alertas de operación (F12.8, ADR-031): lo que corre solo avisa solo.
 *
 * El latido va al FINAL del pase y aunque algún chequeo haya fallado: dice
 * "el worker, pg-boss y este job están vivos", que es justo lo que no se
 * puede avisar desde adentro cuando deja de ser cierto.
 */
@Injectable()
export class OpsJobs implements OnApplicationBootstrap {
  constructor(
    @Inject(BossService) private readonly boss: BossService,
    @Inject(OpsAlertsService) private readonly alerts: OpsAlertsService,
    @Inject(DbService) private readonly db: DbService,
    @Inject(OpsScanRepository) private readonly scan: OpsScanRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Mismo criterio que los otros jobs: fatal en el worker, tolerado en la API.
    try {
      await this.boss.registerRecurring({
        queue: WATCH_QUEUE,
        cron: WATCH_CRON,
        expireInSeconds: WATCH_EXPIRE_SECONDS,
        handler: () => this.vigilar(),
      });
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(`[jobs] ${WATCH_QUEUE} no quedó agendado; la API sigue sin él:`, error);
    }
  }

  async vigilar(): Promise<void> {
    await this.alerts.correr(this.chequeos());
    await pingHealthcheck(env.HEALTHCHECK_WORKER_URL);
  }

  private chequeos(): Chequeo[] {
    // Saldo y respaldo leen los mismos eventos: una sola lectura por pase.
    let lectura: Promise<ResultadoDeIa> | undefined;
    const ia = () =>
      (lectura ??= this.db
        .runWorkerScan((tx) => this.scan.usoReciente(tx, haceMinutos(VENTANA_RECIENTE_MIN)))
        .then(chequeoDeIa));
    return [
      {
        nombre: "jobs",
        prefix: "job:",
        correr: async () => {
          const colas = await this.boss.resumenDeColas(VENTANA_FALLOS_MIN);
          return { firing: chequeoDeJobs(colas, new Date()), evaluadas: llavesDeJobs(colas) };
        },
      },
      {
        nombre: "cards",
        prefix: "cards:",
        correr: async () =>
          chequeoDeCards(
            await this.db.runWorkerScan((tx) =>
              this.scan.cardsFallidas(tx, haceMinutos(VENTANA_RECIENTE_MIN)),
            ),
          ),
      },
      {
        nombre: "saldo",
        prefix: "saldo:",
        correr: async () => (await ia()).saldo,
      },
      {
        nombre: "respaldo",
        prefix: "respaldo:",
        correr: async () => (await ia()).respaldo,
      },
    ];
  }
}

function haceMinutos(minutos: number): Date {
  return new Date(Date.now() - minutos * 60_000);
}
