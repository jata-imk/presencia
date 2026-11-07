import type { ResumenDeCola } from "../jobs/boss.service.js";
import { duracion, type Observacion } from "./alert-state.js";

// Los chequeos de `ops.watch` como funciones puras: reciben lo que se leyó y
// devuelven qué está prendido. La lectura vive en OpsWatch.

/**
 * Cuánto tiempo un fallo mantiene prendida la alerta de su cola aunque el job
 * siguiente haya salido bien. Sin esta ventana, una cola de trabajos puntuales
 * que falla para un usuario y sale bien para el siguiente prendería y
 * apagaría la alerta en cada pase (un "nueva" y un "resuelta" cada cinco
 * minutos). Con ella, la alerta se apaga 30 minutos después del último fallo.
 */
export const VENTANA_FALLOS_MIN = 30;

/**
 * Jobs fallidos (alcance 1 de la spec). Prendida si el último job terminado de
 * la cola falló, o si alguno falló dentro de la ventana.
 *
 * Lo primero es lo que cubre a los diarios: el backup que falla a las 08:00
 * sigue prendido hasta que el de mañana salga bien, no media hora. Lo segundo
 * es lo que cubre a los frecuentes (ver VENTANA_FALLOS_MIN).
 */
export function chequeoDeJobs(colas: readonly ResumenDeCola[], ahora: Date): Observacion[] {
  return colas
    .filter((c) => c.lastState === "failed" || c.recentFailures > 0)
    .map((c) => {
      const cuando = c.lastFailedAt ? ` · el último hace ${duracion(c.lastFailedAt, ahora)}` : "";
      const cuantos =
        c.recentFailures > 0
          ? `${String(c.recentFailures)} ${c.recentFailures === 1 ? "fallo" : "fallos"} en ${String(VENTANA_FALLOS_MIN)} min`
          : "falló la última corrida";
      return {
        key: `job:${c.queue}`,
        title: `Falla el job ${c.queue}`,
        detail: `${cuantos}${cuando}\n${c.lastError ?? "(sin mensaje de error)"}`,
      };
    });
}

/** Las llaves que el chequeo de jobs puede ver: una por cola con historia en la semana. */
export function llavesDeJobs(colas: readonly ResumenDeCola[]): string[] {
  return colas.map((c) => `job:${c.queue}`);
}
