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
  /**
   * Lo prendido; si el chequeo no alcanza a ver todo su prefijo, lo que sí
   * miró; y, si de la misma lectura salen alertas de otro prefijo, esas
   * (`otros`). Así una lectura que truena es UNA alerta de "no se pudo
   * revisar", no una por cada prefijo que dependía de ella.
   */
  correr: () => Promise<
    | Observacion[]
    | { firing: Observacion[]; evaluadas?: readonly string[]; otros?: ResultadoChequeo[] }
  >;
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
        if (Array.isArray(visto)) {
          resultados.push({ prefix: chequeo.prefix, firing: visto });
        } else {
          const { otros, ...propio } = visto;
          resultados.push({ prefix: chequeo.prefix, ...propio }, ...(otros ?? []));
        }
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
   * Decide, guarda, avisa (separado de `correr` para poder probarlo con
   * resultados fijos).
   *
   * Leer, decidir y guardar van en UNA transacción con un candado: dos pases
   * que se crucen (`ops:vigilar` a mano mientras el worker corre el suyo) se
   * serializan, y el segundo ve lo que el primero guardó en vez de avisar lo
   * mismo otra vez. El envío va DESPUÉS, fuera de la transacción: con
   * Telegram y el correo colgados son hasta ~40 s, y no se puede tener una
   * conexión del pool y el candado tomados todo ese tiempo. Por eso se guarda
   * optimista ("ya se avisó") y, si ningún canal respondió, se deshace solo
   * eso: el pase siguiente lo reintenta.
   */
  async reportar(resultados: readonly ResultadoChequeo[], ahora: Date): Promise<void> {
    const { avisos, deshacer } = await this.db.runWorkerScan(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ops_alerts'))`);
      const filas = await this.repo.todas(tx);
      const previas = new Map(filas.map((f) => [f.key, f]));
      const plan = planear(resultados, previas, ahora);
      const deshacer: { key: string; lastSentAt: Date | null }[] = [];

      for (const paso of plan) {
        const previa = previas.get(paso.key);
        const avisa = paso.aviso !== undefined && paso.aviso.decision !== "resuelta";
        if (avisa) deshacer.push({ key: paso.key, lastSentAt: previa?.lastSentAt ?? null });
        switch (paso.accion) {
          case "prender":
            await this.repo.prender(tx, {
              key: paso.key,
              title: paso.title,
              detail: paso.detail,
              // Un reintento de un aviso que no salió conserva su inicio.
              since: previa?.firing ? previa.since : ahora,
              lastSentAt: ahora,
            });
            break;
          case "seguir":
            await this.repo.actualizar(tx, paso.key, {
              title: paso.title,
              detail: paso.detail,
              ...(avisa ? { lastSentAt: ahora } : {}),
            });
            break;
          case "apagar":
            // Se apaga aunque el "resuelto" no llegue a salir: dejarla
            // prendida para reintentar el aviso confundiría el estado real.
            // Queda en el log.
            await this.repo.apagar(tx, paso.key);
            break;
        }
      }
      return { avisos: plan.flatMap((p) => (p.aviso ? [p.aviso] : [])), deshacer };
    });

    if (avisos.length === 0) return;
    for (const aviso of avisos) {
      console.warn(`[ops] ${aviso.decision}: ${aviso.key} — ${aviso.title}\n${aviso.detail}`);
    }
    const enviado = await this.sender.enviar(componerMensaje(avisos, entorno(), ahora));
    if (!enviado && deshacer.length > 0) {
      await this.db.runWorkerScan(async (tx) => {
        for (const { key, lastSentAt } of deshacer) {
          await this.repo.marcarEnvio(tx, key, lastSentAt);
        }
      });
    }
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
