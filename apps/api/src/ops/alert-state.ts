// La lógica de "cuándo se avisa" de las alertas de operación (F12.8, ADR-031),
// pura para poder probarla sin base ni red.
//
// La regla anti-spam: se avisa al CAMBIAR de estado (se prende, se apaga), y
// mientras siga prendida, un recordatorio cada RECORDATORIO_MS. Nunca en cada
// pase: `cards.reconcile` corre cada minuto y `ops.watch` cada cinco, así que
// avisar por repetición serían docenas de mensajes por hora del mismo fallo.

/** Mientras una alerta siga prendida, cada cuánto se recuerda. */
export const RECORDATORIO_MS = 24 * 60 * 60 * 1000;

/**
 * Holgura del recordatorio. La prueba diaria corre cada 24 h exactas y su
 * `last_sent_at` se fija al empezar el pase: con el jitter del cron, la
 * siguiente cae unos segundos antes de cumplir 24 h y el recordatorio se
 * saltaba un día sí y otro no.
 */
export const MARGEN_RECORDATORIO_MS = 15 * 60 * 1000;

/**
 * Tope de un detalle, en caracteres. Así un mensaje con unas cuantas alertas
 * cabe en los 4096 de Telegram (y un error de pg-boss con stack no se come el
 * mensaje entero).
 */
export const MAX_DETALLE = 600;

/** Lo que un chequeo vio prendido en este pase. */
export interface Observacion {
  /** Llave estable, p. ej. `job:backups.daily`. Empieza con el prefijo del chequeo. */
  key: string;
  /** Qué está mal, en una línea. */
  title: string;
  /** El detalle de este pase (el error, cuántas veces, desde cuándo). */
  detail: string;
}

/**
 * El resultado de un chequeo. Un chequeo es DUEÑO de su prefijo: toda alerta
 * prendida con ese prefijo que no aparezca en `firing` se da por resuelta.
 * Si el chequeo mismo truena, no hay resultado y nada de su prefijo se
 * resuelve (no ver algo no es lo mismo que ver que está bien).
 *
 * Un prefijo que termina en `:` cubre todas las llaves que empiezan así
 * (`job:` → `job:backups.daily`); uno sin `:` al final es una llave exacta.
 * Así `chequeo:jobs` no se come a `chequeo:jobs-lentos`.
 */
export interface ResultadoChequeo {
  prefix: string;
  firing: Observacion[];
  /**
   * Las llaves que el chequeo de verdad pudo mirar en este pase. Sin esto,
   * todo el prefijo. Con esto, una alerta prendida que el chequeo ya no
   * alcanza a ver (la cola de un job que falló hace más de 7 días y pg-boss
   * ya borró) se queda como está, en vez de darse por resuelta sin que nada
   * se haya arreglado.
   */
  evaluadas?: readonly string[];
}

export function cubre(prefix: string, key: string): boolean {
  return prefix.endsWith(":") ? key.startsWith(prefix) : key === prefix;
}

/** La fila de `ops_alerts` que importa para decidir. */
export interface EstadoPrevio {
  firing: boolean;
  since: Date;
  lastSentAt: Date | null;
  title: string;
  /** La última vez que un chequeo la vio (o la tocó). */
  updatedAt?: Date;
}

/**
 * Cuánto se conserva una alerta que el chequeo ya no alcanza a ver (fuera de
 * `evaluadas`): la cola de un job que falló y no volvió a correr, cuyas
 * filas pg-boss borra a los 7 días. Pasado esto se apaga EN SILENCIO —no hubo
 * arreglo que anunciar—, y si la cola vuelve a fallar después, es una alerta
 * nueva con su fecha, no un "Sigue… desde hace 28 d".
 */
export const OLVIDO_MS = 8 * 24 * 60 * 60 * 1000;

export type Decision = "nueva" | "recordatorio" | "resuelta" | "callar";

export function decidir(
  previo: EstadoPrevio | undefined,
  prendida: boolean,
  ahora: Date,
): Decision {
  if (prendida) {
    if (!previo?.firing) return "nueva";
    // Prendida pero el aviso nunca salió (ningún canal respondió): se vuelve
    // a intentar como nueva, que es lo que el founder no ha visto.
    if (!previo.lastSentAt) return "nueva";
    return ahora.getTime() - previo.lastSentAt.getTime() >= RECORDATORIO_MS - MARGEN_RECORDATORIO_MS
      ? "recordatorio"
      : "callar";
  }
  if (!previo?.firing) return "callar";
  // Se apagó sin que nadie se enterara de que se prendió: avisar "resuelta"
  // de algo que nunca se avisó solo confunde.
  return previo.lastSentAt ? "resuelta" : "callar";
}

/** Una línea del mensaje de un pase. */
export interface Aviso {
  key: string;
  decision: Exclude<Decision, "callar">;
  title: string;
  detail: string;
  /** Desde cuándo está prendida (para "duró…" y "desde hace…"). */
  since: Date;
}

/** "3 min", "2 h", "1 d": para el mensaje, no para medir. */
export function duracion(desde: Date, hasta: Date): string {
  const minutos = Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60_000));
  if (minutos < 60) return `${String(minutos)} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `${String(horas)} h`;
  return `${String(Math.round(horas / 24))} d`;
}

export interface Paso {
  key: string;
  accion: "prender" | "seguir" | "apagar";
  title: string;
  detail: string;
  aviso?: Aviso;
}

/** Puro: qué hacer con cada llave de los prefijos que se revisaron. */
export function planear(
  resultados: readonly ResultadoChequeo[],
  previas: ReadonlyMap<string, EstadoPrevio & { detail: string }>,
  ahora: Date,
): Paso[] {
  const pasos: Paso[] = [];
  for (const { prefix, firing, evaluadas } of resultados) {
    const vistas = new Map(firing.map((o) => [o.key, o]));
    const alcance = evaluadas ? new Set(evaluadas) : null;
    const prendidasAntes = [...previas.entries()]
      .filter(([key, fila]) => fila.firing && cubre(prefix, key) && (!alcance || alcance.has(key)))
      .map(([key]) => key);
    for (const [key, fila] of previas) {
      const fueraDeAlcance = alcance !== null && !alcance.has(key) && !vistas.has(key);
      const olvidada =
        fila.updatedAt !== undefined && ahora.getTime() - fila.updatedAt.getTime() >= OLVIDO_MS;
      if (fila.firing && cubre(prefix, key) && fueraDeAlcance && olvidada) {
        pasos.push({ key, accion: "apagar", title: fila.title, detail: fila.detail });
      }
    }

    for (const key of new Set([...vistas.keys(), ...prendidasAntes])) {
      const vista = vistas.get(key);
      const previa = previas.get(key);
      const decision = decidir(previa, vista !== undefined, ahora);

      if (vista) {
        // Sin líneas en blanco: el mensaje separa las alertas con una.
        const detail = vista.detail.replace(/\n{2,}/g, "\n").slice(0, MAX_DETALLE);
        const accion = decision === "nueva" ? "prender" : "seguir";
        const aviso: Aviso | undefined =
          decision === "nueva" || decision === "recordatorio"
            ? {
                key,
                decision,
                title: vista.title,
                detail,
                since: previa?.firing ? previa.since : ahora,
              }
            : undefined;
        pasos.push({ key, accion, title: vista.title, detail, ...(aviso ? { aviso } : {}) });
      } else if (previa) {
        pasos.push({
          key,
          accion: "apagar",
          title: previa.title,
          detail: previa.detail,
          ...(decision === "resuelta"
            ? {
                aviso: {
                  key,
                  decision,
                  title: previa.title,
                  detail: previa.detail,
                  since: previa.since,
                },
              }
            : {}),
        });
      }
    }
  }
  return pasos;
}
