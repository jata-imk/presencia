import {
  NETWORK_LABELS,
  type BaseDeCalculoDto,
  type EstadoPublicacion,
  type PeriodoAnaliticas,
  type SocialNetwork,
} from "@presencia/shared";

// Cómo se DICE cada número de Analíticas. No calcula ninguno: el motor ya los
// mandó (addendum F12 de ADR-022). Aquí solo se decide su forma y el copy que
// la API no manda a propósito (los estados viajan como estados, no como
// frases).
//
// Puro para poder probarlo sin montar la pantalla.

/** El signo de menos tipográfico, como en el diseño ("−3%"), no el guion. */
const MENOS = "−";

const entero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat("es-MX", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const unDecimal = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/**
 * "2,140" hasta 9,999; de ahí "48.2K" o "1.3M". `Intl` en es-MX escribe
 * "48.2 k", y el diseño (y las redes) dicen "48.2K".
 */
export function numero(n: number): string {
  if (Math.abs(n) < 10_000) return entero.format(n);
  return compacto.format(n).replace(/\s?k$/i, "K").replace(/\s?M$/, "M");
}

/** El engagement en su unidad: "5.2%" con tasa, "86" + "por publicación" sin alcance. */
export function textoEngagement(
  base: BaseDeCalculoDto,
  valor: number,
): { numero: string; unidad: string | null } {
  return base === "tasa"
    ? { numero: `${unDecimal.format(valor * 100)}%`, unidad: null }
    : { numero: numero(Math.round(valor)), unidad: "por publicación" };
}

export type Direccion = "sube" | "baja" | "igual";

export interface Cambio {
  texto: string;
  direccion: Direccion;
}

/**
 * Cómo se dice un cambio "vs periodo anterior":
 *
 * - `pts`: engagement con tasa; llega como fracción (0.004 → "+0.4 pts").
 * - `interacciones`: engagement sin alcance, interacciones por publicación.
 * - `pct`: alcance e interacciones; llega como porcentaje entero.
 * - `unidades`: publicaciones.
 *
 * La dirección sale de lo que se lee, no del número crudo: un +0.02 pts que
 * se redondea a "0 pts" no se pinta verde.
 */
export function textoCambio(
  tipo: "pts" | "interacciones" | "pct" | "unidades",
  cambio: number,
): Cambio {
  // Se redondea con aritmética, no reinterpretando el texto formateado: con
  // separador de miles ("1,000") `Number()` daba NaN.
  const magnitud =
    tipo === "pts" ? Math.round(Math.abs(cambio) * 1000) / 10 : Math.round(Math.abs(cambio));
  const direccion: Direccion = magnitud === 0 ? "igual" : cambio > 0 ? "sube" : "baja";
  const signo = direccion === "sube" ? "+" : direccion === "baja" ? MENOS : "";
  const cuerpo =
    tipo === "pts"
      ? `${unDecimal.format(magnitud)} pts`
      : tipo === "pct"
        ? `${entero.format(magnitud)}%`
        : entero.format(magnitud);
  return { texto: `${signo}${cuerpo}`, direccion };
}

/** El cambio del engagement en la unidad de su base. */
export function cambioDeEngagement(base: BaseDeCalculoDto, cambio: number): Cambio {
  return textoCambio(base === "tasa" ? "pts" : "interacciones", cambio);
}

/** El lift: "+62%", "−4%", "0%". Siempre contra tu promedio en esa red. */
export function textoLift(lift: number): Cambio {
  return textoCambio("pct", lift);
}

/** "Instagram", "Instagram y Facebook", "Instagram, Facebook y Threads". */
export function listaDeRedes(redes: readonly SocialNetwork[]): string {
  return new Intl.ListFormat("es-MX", { type: "conjunction" }).format(
    redes.map((red) => NETWORK_LABELS[red]),
  );
}

// ---------------------------------------------------------------------------
// La tendencia de "Por red"

const TRAMOS_POR_PERIODO: Record<PeriodoAnaliticas, number> = { 7: 7, 30: 5, 90: 9 };
const DIA = 24 * 60 * 60 * 1000;

export interface Tramo {
  inicio: Date;
  fin: Date;
}

/**
 * Los tramos de la tendencia, del más viejo al más nuevo: 7 de 1 día, 5 de 6
 * o 9 de 10, terminando ahora. La misma partición que hace `tendenciaDe` en
 * el motor (`metrics/analisis.ts`); aquí solo sirve para ETIQUETAR cada barra,
 * los valores ya vienen calculados.
 */
export function tramosDe(periodo: PeriodoAnaliticas, ahora: Date): Tramo[] {
  const cuantos = TRAMOS_POR_PERIODO[periodo];
  const ancho = (periodo * DIA) / cuantos;
  const desde = ahora.getTime() - periodo * DIA;
  return Array.from({ length: cuantos }, (_, i) => ({
    inicio: new Date(desde + i * ancho),
    fin: new Date(desde + (i + 1) * ancho),
  }));
}

function partes(fecha: Date, timeZone: string): { dia: string; mes: string } {
  const valores = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(fecha);
  const de = (tipo: string) => valores.find((p) => p.type === tipo)?.value ?? "";
  return { dia: de("day"), mes: de("month").replace(".", "") };
}

/** "28 oct": el extremo izquierdo de la tendencia. */
export function fechaCorta(fecha: Date, timeZone: string): string {
  const { dia, mes } = partes(fecha, timeZone);
  return `${dia} ${mes}`;
}

/**
 * "14–15 nov" o "28 oct – 2 nov", para el tooltip de una barra. `Intl` tiene
 * `formatRange`, pero en es-MX escribe "28 de oct – 2 de nov".
 */
export function rangoDeTramo(tramo: Tramo, timeZone: string): string {
  // El fin es exclusivo: el último instante del tramo es un milisegundo antes.
  const a = partes(tramo.inicio, timeZone);
  const b = partes(new Date(tramo.fin.getTime() - 1), timeZone);
  if (a.mes === b.mes) return a.dia === b.dia ? `${a.dia} ${a.mes}` : `${a.dia}–${b.dia} ${b.mes}`;
  return `${a.dia} ${a.mes} – ${b.dia} ${b.mes}`;
}

// ---------------------------------------------------------------------------
// El copy que la API no manda

/** Por qué una red no da números. Nunca "sigue publicando": no se desbloquea. */
export function motivoNoReporta(red: SocialNetwork): string {
  if (red === "linkedin") return "LinkedIn no comparte estadísticas de perfiles personales";
  return `${NETWORK_LABELS[red]} no comparte estadísticas de tus publicaciones`;
}

/** Por qué una red que sí reporta otras cosas no tiene alcance (TikTok, YouTube). */
export function motivoSinAlcance(red: SocialNetwork): string {
  return `${NETWORK_LABELS[red]} no reporta alcance`;
}

export interface CopyDeEstado {
  titulo: string;
  detalle: string;
}

/**
 * Lo que se lee en una publicación sin números (lore doc §4). Son estados
 * distintos del mundo, no grados del mismo vacío: cada uno dice el suyo.
 * `medida` no tiene copy: se ven sus números.
 */
export function copyDeEstado(estado: EstadoPublicacion, red: SocialNetwork): CopyDeEstado | null {
  switch (estado) {
    case "medida":
      return null;
    case "en_camino":
      return {
        titulo: "Métricas en camino",
        detalle: `${NETWORK_LABELS[red]} suele tardar unas horas en reportar`,
      };
    case "no_reporta":
      return { titulo: "No disponible", detalle: motivoNoReporta(red) };
    case "sin_medicion":
      return {
        titulo: "Sin medición para esta publicación",
        detalle: "El servicio con el que se publicó no nos dio cómo seguirla en la red",
      };
  }
}

/** Desde cuánto tiempo sin medir la barra de control dice "Actualizado hace…". */
export const HORAS_PARA_AVISAR_ACTUALIZACION = 6;

/** `true` si la última medición ya tiene horas (una nota, no una alarma). */
export function avisarActualizacion(ultimaMedicion: string | null, ahora: Date): boolean {
  if (!ultimaMedicion) return false;
  const horas = (ahora.getTime() - new Date(ultimaMedicion).getTime()) / (60 * 60 * 1000);
  return horas >= HORAS_PARA_AVISAR_ACTUALIZACION;
}
