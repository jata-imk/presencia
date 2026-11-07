import { QUOTA_BODY } from "../ai/fallback.js";
import type { ResumenDeCola } from "../jobs/boss.service.js";
import { duracion, type Observacion } from "./alert-state.js";
import type { EventoDeUso, MotivoDeFallo } from "./ops-scan.repository.js";

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

// --- PR3: cards degradadas y proveedores de IA ---

/** La ventana de los chequeos de cards y de IA. */
export const VENTANA_RECIENTE_MIN = 60;

/**
 * Cuántas cards fallidas en la ventana hacen un "pico". Una sola es de un
 * creator (su cuenta desconectada, un video que la red rechazó) y no es
 * operación. Tres en una hora, con el volumen de hoy, ya no es ruido: es la
 * primera señal de que el proveedor de publicación cambió algo (spec, alcance 3).
 */
export const UMBRAL_CARDS_FALLIDAS = 3;

export function chequeoDeCards(motivos: readonly MotivoDeFallo[]): Observacion[] {
  const total = motivos.reduce((suma, m) => suma + m.n, 0);
  if (total < UMBRAL_CARDS_FALLIDAS) return [];
  const desglose = [...motivos]
    .sort((a, b) => b.n - a.n)
    .map((m) => `${String(m.n)} × ${m.reason ?? "(sin motivo)"}`)
    .join("\n");
  return [
    {
      key: "cards:degradadas",
      title: `${String(total)} cards pasaron a fallidas en ${String(VENTANA_RECIENTE_MIN)} min`,
      detail: desglose,
    },
  ];
}

interface Intento {
  id: string;
  status: number | null;
  error: string;
}

function intentos(raw: unknown): Intento[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Intento =>
      typeof a === "object" && a !== null && typeof (a as Intento).id === "string",
  );
}

/** Un intento caído por saldo: 402, o el cuerpo que la cadena ya reconoce como "sin cuota". */
export function esSinSaldo(intento: Pick<Intento, "status" | "error">): boolean {
  return intento.status === 402 || QUOTA_BODY.test(intento.error ?? "");
}

/**
 * Saldo (alcance 5, señal pasiva): un eslabón de una cadena que cayó por
 * saldo en la ventana. Uno basta: un 402 no es intermitente, y el respaldo
 * esconde la caída al usuario, así que nadie más se va a enterar.
 */
export function chequeoDeSaldo(eventos: readonly EventoDeUso[]): Observacion[] {
  const porProveedor = new Map<string, { n: number; ultimo: Intento }>();
  for (const evento of eventos) {
    for (const intento of intentos(evento.attempts)) {
      if (!esSinSaldo(intento)) continue;
      const proveedor = intento.id.split(":")[0] ?? intento.id;
      const previo = porProveedor.get(proveedor);
      porProveedor.set(proveedor, { n: (previo?.n ?? 0) + 1, ultimo: intento });
    }
  }
  return [...porProveedor.entries()].map(([proveedor, { n, ultimo }]) => ({
    key: `saldo:${proveedor}`,
    title: `${proveedor} se quedó sin saldo`,
    detail: `${String(n)} ${n === 1 ? "intento caído" : "intentos caídos"} por saldo en ${String(VENTANA_RECIENTE_MIN)} min (el respaldo contestó)\n${ultimo.id}: ${ultimo.error}`,
  }));
}

/**
 * Con cuántas respuestas en la ventana se juzga un principal, y qué parte
 * tiene que haber contestado el respaldo. Menos de 5 es ruido de una caída
 * de un minuto; la mitad ya es "el respaldo está cargando con el tráfico".
 */
export const MIN_EVENTOS_RESPALDO = 5;
export const PROPORCION_RESPALDO = 0.5;

/**
 * Un respaldo cargando con el tráfico (alcance 5): la mitad o más de lo que
 * pidió un principal la contestó otro. Cubre lo que el saldo no: un
 * principal caído por 5xx o timeouts, o un 401 de una key revocada.
 */
export function chequeoDeRespaldo(eventos: readonly EventoDeUso[]): Observacion[] {
  const porPrincipal = new Map<string, { total: number; respaldo: Map<string, number> }>();
  for (const evento of eventos) {
    const principal = evento.fallbackFrom ?? `${evento.provider}:${evento.model}`;
    const fila = porPrincipal.get(principal) ?? { total: 0, respaldo: new Map<string, number>() };
    fila.total += 1;
    if (evento.fallbackFrom) {
      const quien = `${evento.provider}:${evento.model}`;
      fila.respaldo.set(quien, (fila.respaldo.get(quien) ?? 0) + 1);
    }
    porPrincipal.set(principal, fila);
  }
  const observaciones: Observacion[] = [];
  for (const [principal, { total, respaldo }] of porPrincipal) {
    const n = [...respaldo.values()].reduce((a, b) => a + b, 0);
    if (total < MIN_EVENTOS_RESPALDO || n / total < PROPORCION_RESPALDO) continue;
    const quienes = [...respaldo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, k]) => `${id} (${String(k)})`)
      .join(", ");
    observaciones.push({
      key: `respaldo:${principal}`,
      title: `${principal} no está contestando: lo cubre el respaldo`,
      detail: `${String(n)} de ${String(total)} respuestas en ${String(VENTANA_RECIENTE_MIN)} min las dio el respaldo: ${quienes}`,
    });
  }
  return observaciones;
}
