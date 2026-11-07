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
} from "./chequeos.js";
import { pingHealthcheck } from "./healthchecks.js";
import {
  correrSondas,
  observacionesDeSondas,
  PREFIJO_PRUEBA,
  PREFIJO_PRUEBA_IMAGEN,
  resumenParaLog,
  sondasDelEntorno,
  type ResultadoSonda,
} from "./provider-probe.js";
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

// La prueba activa (PR4): diaria a las 14:00 UTC, 08:00 en Mérida, para que
// el aviso esté ahí al empezar el día. Las sondas corren en paralelo con techo
// de 2 min la más lenta (imagen): 10 min es cota de sobra.
const PROBE_QUEUE = "ops.probe";
const PROBE_CRON = "0 14 * * *";
const PROBE_EXPIRE_SECONDS = 10 * 60;
/** Las imágenes, solo los lunes (son lo caro; ver ADR-031). */
const DIA_DE_IMAGENES = 1;

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
      // Solo en producción: en dev le pegaría todos los días a las keys de
      // dev sin que nadie mire el resultado. Para probarla a mano está
      // `pnpm --filter @presencia/api sonda:proveedores`.
      if (env.NODE_ENV === "production") {
        await this.boss.registerRecurring({
          queue: PROBE_QUEUE,
          cron: PROBE_CRON,
          expireInSeconds: PROBE_EXPIRE_SECONDS,
          handler: async () => {
            await this.probar({ imagenes: new Date().getUTCDay() === DIA_DE_IMAGENES });
          },
        });
      }
    } catch (error) {
      if (enProcesoWorker()) throw error;
      console.error(
        `[jobs] ${WATCH_QUEUE}/${PROBE_QUEUE} no quedaron agendados; la API sigue sin ellos:`,
        error,
      );
    }
  }

  /** La prueba activa: una llamada a cada eslabón, y sus alertas `probe:`. */
  async probar(opciones: { imagenes: boolean }): Promise<ResultadoSonda[]> {
    // Armar las sondas puede tronar (una cadena mal escrita): eso se avisa
    // como la alerta del chequeo y NO se relanza, o el mismo problema
    // llegaría dos veces (también como `job:ops.probe`).
    let resultados: ResultadoSonda[] = [];
    let fallo: Error | undefined;
    try {
      // Los defaults que decide env.ts (no el process.env crudo), para probar
      // lo mismo que la app usa.
      const fuente = {
        ...process.env,
        IMAGE_PROVIDER: env.IMAGE_PROVIDER,
        WEB_SEARCH_PROVIDER: env.WEB_SEARCH_PROVIDER,
      };
      resultados = await correrSondas(sondasDelEntorno(fuente, opciones));
      console.info(`[ops] prueba de proveedores:\n${resumenParaLog(resultados)}`);
    } catch (error) {
      fallo = error instanceof Error ? error : new Error(String(error));
    }
    // Un solo chequeo para los dos prefijos: si armar las sondas truena, una
    // alerta, no una por prefijo. Las imágenes van en `otros` solo el día que
    // se probaron (si no, su prefijo no se evalúa y sus alertas se quedan).
    const chequeos: Chequeo[] = [
      {
        nombre: "prueba",
        prefix: PREFIJO_PRUEBA,
        correr: () => {
          if (fallo) return Promise.reject(fallo);
          return Promise.resolve({
            firing: observacionesDeSondas(resultados, PREFIJO_PRUEBA),
            otros: opciones.imagenes
              ? [
                  {
                    prefix: PREFIJO_PRUEBA_IMAGEN,
                    firing: observacionesDeSondas(resultados, PREFIJO_PRUEBA_IMAGEN),
                  },
                ]
              : [],
          });
        },
      },
    ];
    await this.alerts.correr(chequeos);
    return resultados;
  }

  async vigilar(): Promise<void> {
    await this.alerts.correr(this.chequeos());
    await pingHealthcheck(env.HEALTHCHECK_WORKER_URL);
  }

  private chequeos(): Chequeo[] {
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
        // Saldo y respaldo salen de la misma lectura: un solo chequeo, y si
        // la lectura truena, una sola alerta de "no se pudo revisar".
        nombre: "ia",
        prefix: "saldo:",
        correr: async () => {
          const { saldo, respaldo } = chequeoDeIa(
            await this.db.runWorkerScan((tx) =>
              this.scan.usoReciente(tx, haceMinutos(VENTANA_RECIENTE_MIN)),
            ),
          );
          return { ...saldo, otros: [{ prefix: "respaldo:", ...respaldo }] };
        },
      },
    ];
  }
}

function haceMinutos(minutos: number): Date {
  return new Date(Date.now() - minutos * 60_000);
}
