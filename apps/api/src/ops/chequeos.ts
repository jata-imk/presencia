import type { ResumenDeCola } from "../jobs/boss.service.js";
import { duracion, type Observacion } from "./alert-state.js";
import type { CardsFallidas, EventoDeUso } from "./ops-scan.repository.js";

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
 * Jobs fallidos (alcance 1 de la spec). Prendida si alguno falló dentro de la
 * ventana, o —solo en los recurrentes— si el último terminado falló.
 *
 * Lo segundo cubre a los diarios: el backup que falla a las 08:00 sigue
 * prendido hasta que el de mañana salga bien, no media hora. Pero en una cola
 * de trabajos puntuales (policy `short`) "el último falló" puede ser la
 * entrada de UN creator en una cola que nadie más usó en días: eso no es
 * operación, y con recordatorio diario enseñaría a ignorar las alertas. Ahí
 * manda solo la ventana.
 */
export function chequeoDeJobs(colas: readonly ResumenDeCola[], ahora: Date): Observacion[] {
  return colas
    .filter((c) => c.recentFailures > 0 || (c.lastState === "failed" && c.policy !== "short"))
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
 * Cuándo un montón de cards fallidas es un "pico" de operación y no el
 * problema de alguien. Una persona con la cuenta desconectada puede tener
 * tres cards vencidas que fallan en el mismo pase: eso es suyo, no del
 * proveedor. Lo que señala que el proveedor de publicación cambió algo
 * (spec, alcance 3) es que fallen a la vez cards de creators distintos.
 */
export const UMBRAL_CARDS_FALLIDAS = 3;
export const UMBRAL_CREADORES = 2;

export function chequeoDeCards({ motivos, creadores }: CardsFallidas): Observacion[] {
  const total = motivos.reduce((suma, m) => suma + m.n, 0);
  if (total < UMBRAL_CARDS_FALLIDAS || creadores < UMBRAL_CREADORES) return [];
  const desglose = [...motivos]
    .sort((a, b) => b.n - a.n)
    .map((m) => `${String(m.n)} × ${m.reason ?? "(sin motivo)"}`)
    .join("\n");
  return [
    {
      key: "cards:degradadas",
      title: `${String(total)} cards de ${String(creadores)} creators pasaron a fallidas en ${String(VENTANA_RECIENTE_MIN)} min`,
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

function proveedorDe(id: string): string {
  return id.split(":")[0] ?? id;
}

/**
 * Lo que dice un proveedor cuando se acabó el crédito: OpenAI
 * `insufficient_quota` (como 429), Anthropic "credit balance is too low",
 * Gemini "prepayment credits are depleted". El genérico "Quota exceeded" NO
 * entra, venga con el status que venga (429, o null en un error de stream):
 * es lo que dice el límite por minuto de Gemini, y una ráfaga de tráfico no
 * es una cuenta sin saldo. Por eso no se reusa `QUOTA_BODY` de la cadena: a
 * ella le basta con saber que hay que saltar al respaldo; aquí hay que saber
 * si recargar.
 */
const SALDO_AGOTADO = /insufficient_quota|billing|credit balance|prepayment|credits are depleted/i;

/** ¿Este error es falta de saldo? Lo usan la señal pasiva y la prueba diaria. */
export function esErrorDeSaldo(status: number | null, cuerpo: string): boolean {
  return status === 402 || SALDO_AGOTADO.test(cuerpo);
}

/** Un intento caído por saldo (ver `esErrorDeSaldo`). */
export function esSinSaldo(intento: Pick<Intento, "status" | "error">): boolean {
  return esErrorDeSaldo(intento.status, intento.error ?? "");
}

/** Saldo y respaldo leen los mismos eventos: se resuelven juntos en un solo paso. */
export interface ResultadoDeIa {
  saldo: { firing: Observacion[]; evaluadas: string[] };
  respaldo: { firing: Observacion[]; evaluadas: string[] };
}

/**
 * Con cuántas respuestas en la ventana se juzga un principal, y qué parte
 * tiene que haber contestado el respaldo. Menos de 5 es ruido de una caída
 * de un minuto; la mitad ya es "el respaldo está cargando con el tráfico".
 */
export const MIN_EVENTOS_RESPALDO = 5;
export const PROPORCION_RESPALDO = 0.5;

/**
 * Los proveedores de IA (alcance 5, señal pasiva), a partir de los eventos
 * de uso de la ventana.
 *
 * - `saldo:<proveedor>`: un eslabón cayó por saldo. Uno basta: un 402 no es
 *   intermitente, y el respaldo esconde la caída al usuario. Se cuentan
 *   EVENTOS, no intentos (la cadena reintenta una vez el mismo modelo).
 * - `respaldo:<principal>`: la mitad o más de lo que pidió un principal la
 *   contestó otro. Cubre lo que el saldo no: 5xx, timeouts, una key revocada.
 *   Si el proveedor del principal ya está en `saldo:`, no se repite: es la
 *   misma causa, y dos alertas por un fallo son ruido.
 *
 * "Ya se arregló" pide evidencia, no silencio: un proveedor sin tráfico en la
 * hora no se evalúa (su alerta se queda como está), ni un principal con menos
 * de MIN_EVENTOS_RESPALDO eventos. Sin esto, de noche toda alerta se
 * "resolvía" sola y volvía a la mañana como nueva.
 *
 * Hueco conocido: si la cadena ENTERA falla, no queda fila en
 * `ai_usage_events` y aquí no se ve. Eso lo cubre la prueba activa diaria.
 */
export function chequeoDeIa(eventos: readonly EventoDeUso[]): ResultadoDeIa {
  const sinSaldo = new Map<string, { n: number; ultimo: Intento }>();
  const conEvidencia = new Set<string>();
  const porPrincipal = new Map<string, { total: number; respaldo: Map<string, number> }>();

  for (const evento of eventos) {
    const quien = `${evento.provider}:${evento.model}`;
    conEvidencia.add(evento.provider);
    const caidosPorSaldo = new Map<string, Intento>();
    for (const intento of intentos(evento.attempts)) {
      const proveedor = proveedorDe(intento.id);
      conEvidencia.add(proveedor);
      if (esSinSaldo(intento)) caidosPorSaldo.set(proveedor, intento);
    }
    for (const [proveedor, intento] of caidosPorSaldo) {
      const previo = sinSaldo.get(proveedor);
      sinSaldo.set(proveedor, { n: (previo?.n ?? 0) + 1, ultimo: intento });
    }

    const principal = evento.fallbackFrom ?? quien;
    const fila = porPrincipal.get(principal) ?? { total: 0, respaldo: new Map<string, number>() };
    fila.total += 1;
    if (evento.fallbackFrom) fila.respaldo.set(quien, (fila.respaldo.get(quien) ?? 0) + 1);
    porPrincipal.set(principal, fila);
  }

  const saldo = [...sinSaldo.entries()].map(([proveedor, { n, ultimo }]) => ({
    key: `saldo:${proveedor}`,
    title: `${proveedor} se quedó sin saldo`,
    detail: `${String(n)} ${n === 1 ? "respuesta tuvo" : "respuestas tuvieron"} que ir al respaldo por falta de saldo en ${String(VENTANA_RECIENTE_MIN)} min\n${ultimo.id}: ${ultimo.error}`,
  }));

  const respaldo: Observacion[] = [];
  const principalesEvaluados: string[] = [];
  for (const [principal, { total, respaldo: quienes }] of porPrincipal) {
    if (total < MIN_EVENTOS_RESPALDO) continue;
    // Si la causa ya está en `saldo:`, el respaldo ni se evalúa: evaluarlo y
    // callar lo daría por resuelto, y un `respaldo:` que ya estaba prendido
    // mandaría "Resuelto" con el proveedor todavía caído.
    if (sinSaldo.has(proveedorDe(principal))) continue;
    principalesEvaluados.push(`respaldo:${principal}`);
    const n = [...quienes.values()].reduce((a, b) => a + b, 0);
    if (n / total < PROPORCION_RESPALDO) continue;
    const lista = [...quienes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, k]) => `${id} (${String(k)})`)
      .join(", ");
    respaldo.push({
      key: `respaldo:${principal}`,
      title: `${principal} no está contestando: lo cubre el respaldo`,
      detail: `${String(n)} de ${String(total)} respuestas en ${String(VENTANA_RECIENTE_MIN)} min las dio el respaldo: ${lista}`,
    });
  }

  return {
    saldo: { firing: saldo, evaluadas: [...conEvidencia].map((p) => `saldo:${p}`) },
    respaldo: { firing: respaldo, evaluadas: principalesEvaluados },
  };
}
