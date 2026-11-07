import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { OpsAlertSender } from "./alert-sender.js";
import { planear, type Observacion, type ResultadoChequeo } from "./alert-state.js";
import { componerMensaje } from "./mensaje.js";
import { OpsAlertsRepository } from "./ops-alerts.repository.js";

/** Un chequeo: su prefijo de llaves y cómo mira. */
export interface Chequeo {
  /** Nombre corto, para el log y para la alerta de "el chequeo no corrió". */
  nombre: string;
  /** Prefijo de las llaves que el chequeo administra, p. ej. `job:`. */
  prefix: string;
  /** Lo prendido y, si el chequeo no alcanza a ver todo su prefijo, lo que sí miró. */
  correr: () => Promise<Observacion[] | { firing: Observacion[]; evaluadas: readonly string[] }>;
}

/**
 * El corazón de las alertas de operación (F12.8, ADR-031): corre los
 * chequeos, compara con el estado guardado, manda UN mensaje con todo lo que
 * cambió y guarda el estado nuevo.
 *
 * Lo usan `ops.watch` (cada cinco minutos) y, desde PR4, la prueba activa
 * diaria; cada uno con sus chequeos, que no se pisan porque cada uno es dueño
 * de su prefijo.
 */
@Injectable()
export class OpsAlertsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(OpsAlertsRepository) private readonly repo: OpsAlertsRepository,
    @Inject(OpsAlertSender) private readonly sender: OpsAlertSender,
  ) {}

  async correr(chequeos: readonly Chequeo[], ahora = new Date()): Promise<void> {
    const resultados: ResultadoChequeo[] = [];
    for (const chequeo of chequeos) {
      // Un chequeo que truena no resuelve nada de su prefijo (no poder mirar
      // no es ver que está bien), y se avisa como alerta propia: un chequeo
      // roto en silencio es un vigilante ciego.
      const prefijoDelChequeo = `chequeo:${chequeo.nombre}`;
      try {
        const visto = await chequeo.correr();
        resultados.push(
          Array.isArray(visto)
            ? { prefix: chequeo.prefix, firing: visto }
            : { prefix: chequeo.prefix, ...visto },
        );
        resultados.push({ prefix: prefijoDelChequeo, firing: [] });
      } catch (error) {
        console.error(`[ops] el chequeo ${chequeo.nombre} no corrió:`, error);
        resultados.push({
          prefix: prefijoDelChequeo,
          firing: [
            {
              key: prefijoDelChequeo,
              title: `No se pudo revisar: ${chequeo.nombre}`,
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
        });
      }
    }
    await this.reportar(resultados, ahora);
  }

  /**
   * Decide, avisa y guarda, todo dentro de UNA transacción con un candado
   * (separado de `correr` para poder probarlo con resultados fijos).
   *
   * El candado serializa dos pases que se crucen —`ops:vigilar` a mano
   * mientras el worker corre el suyo—: el segundo espera y lee lo que el
   * primero escribió, en vez de decidir los dos "nueva" y mandar el aviso
   * dos veces. Y que leer, mandar y guardar sean una sola transacción hace
   * que un estado que no se pudo guardar se vuelva a decidir entero en el
   * pase siguiente. La transacción queda abierta durante el envío; el envío
   * tiene su propio techo (OpsAlertSender) y esto corre cada cinco minutos.
   */
  async reportar(resultados: readonly ResultadoChequeo[], ahora: Date): Promise<void> {
    await this.db.runWorkerScan(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ops_alerts'))`);
      const filas = await this.repo.todas(tx);
      const previas = new Map(filas.map((f) => [f.key, f]));

      const plan = planear(resultados, previas, ahora);
      const avisos = plan.flatMap((p) => (p.aviso ? [p.aviso] : []));

      let enviado = false;
      if (avisos.length > 0) {
        for (const aviso of avisos) {
          console.warn(`[ops] ${aviso.decision}: ${aviso.key} — ${aviso.title}\n${aviso.detail}`);
        }
        enviado = await this.sender.enviar(componerMensaje(avisos, entorno(), ahora));
      }

      for (const paso of plan) {
        const previa = previas.get(paso.key);
        switch (paso.accion) {
          case "prender":
            await this.repo.prender(tx, {
              key: paso.key,
              title: paso.title,
              detail: paso.detail,
              // Un reintento de un aviso que no salió conserva su inicio.
              since: previa?.firing ? previa.since : ahora,
              lastSentAt: enviado ? ahora : null,
            });
            break;
          case "seguir":
            await this.repo.actualizar(tx, paso.key, {
              title: paso.title,
              detail: paso.detail,
              ...(paso.aviso && enviado ? { lastSentAt: ahora } : {}),
            });
            break;
          case "apagar":
            // Se apaga aunque el "resuelto" no haya salido: dejarla prendida
            // para reintentar el aviso confundiría el estado real. Queda en
            // el log.
            await this.repo.apagar(tx, paso.key);
            break;
        }
      }
    });
  }
}

/** De dónde viene el aviso: el bot de dev y el de prod pueden escribirle al mismo chat. */
function entorno(): string {
  try {
    return new URL(env.BETTER_AUTH_URL).host;
  } catch {
    return env.NODE_ENV ?? "sin entorno";
  }
}
