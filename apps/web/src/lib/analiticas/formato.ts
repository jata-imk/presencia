import {
  NETWORK_LABELS,
  baseDeHallazgoDeVoz,
  fraseDeHallazgoDeVoz,
  textoDiferencia,
  type FraseDeHallazgo,
  type AnaliticasHallazgoDto,
  type BaseDeCalculoDto,
  type DiaDeLaSemana,
  type FormatoPublicado,
  type HallazgoFormatoDto,
  type EstadoPublicacion,
  type MuestraDeRed,
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

// ---------------------------------------------------------------------------
// El detalle de una publicación (PR 7b)

/**
 * "12 sep 2026 · 19:30", en la zona del creator. A 24 horas, como el resto
 * de la app (Calendario, banners de programada y publicada); el diseño decía
 * "7:30 p.m.".
 */
export function fechaYHora(iso: string, timeZone: string): string {
  const valores = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(iso));
  const de = (tipo: string) => valores.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")} ${de("month").replace(".", "")} ${de("year")} · ${de("hour")}:${de("minute")}`;
}

/**
 * Por qué una publicación no tiene "sobre tu promedio". Lo primero es su
 * propia edad (se compara a las 24 h); después, la muestra de su red.
 * `null` si sí debería tenerlo (la red tiene muestra y la publicación ya
 * cumplió 24 h, pero llegó sin números): ahí el estado ya lo explica.
 */
export function motivoSinLift(
  muestra: MuestraDeRed,
  red: SocialNetwork,
  publishedAt: string,
  ahora: Date,
): string | null {
  if (ahora.getTime() - new Date(publishedAt).getTime() < DIA) {
    return "Se compara a las 24 horas de publicada";
  }
  switch (muestra) {
    case "no_reporta":
      return motivoNoReporta(red);
    case "sin_datos":
    case "poca":
      return `${NETWORK_LABELS[red]} todavía no tiene 10 publicaciones medidas para comparar`;
    case "suficiente":
      return null;
  }
}

export type MetricaDetalle = "reach" | "impressions" | "likes" | "comments" | "shares";

/** El orden y el nombre de las cinco métricas del detalle (lore doc §3). */
export const METRICAS_DETALLE: { clave: MetricaDetalle; texto: string }[] = [
  { clave: "reach", texto: "Alcance" },
  { clave: "impressions", texto: "Impresiones" },
  { clave: "likes", texto: "Me gusta" },
  { clave: "comments", texto: "Comentarios" },
  { clave: "shares", texto: "Compartidas" },
];

/**
 * La nota bajo las métricas de una publicación MEDIDA a la que le faltan
 * algunas: "TikTok no reportó alcance ni compartidas para esta publicación".
 * Dice lo que no llegó y nada más: qué red da qué lo sabe el motor por los
 * datos (addendum F12 de ADR-022), no una lista escrita aquí. `null` si
 * llegaron todas.
 */
export function notaDeMetricasFaltantes(
  red: SocialNetwork,
  metricas: Record<MetricaDetalle, number | null>,
): string | null {
  const faltan = METRICAS_DETALLE.filter(({ clave }) => metricas[clave] === null);
  if (faltan.length === 0) return null;
  const lista = new Intl.ListFormat("es-MX", { type: "disjunction" })
    .format(faltan.map(({ texto }) => texto.toLowerCase()))
    .replace(/ o /g, " ni ");
  return `${NETWORK_LABELS[red]} no reportó ${lista} para esta publicación.`;
}

/** Desde cuánto tiempo sin medir la barra de control dice "Actualizado hace…". */
export const HORAS_PARA_AVISAR_ACTUALIZACION = 6;

/** `true` si la última medición ya tiene horas (una nota, no una alarma). */
export function avisarActualizacion(ultimaMedicion: string | null, ahora: Date): boolean {
  if (!ultimaMedicion) return false;
  const horas = (ahora.getTime() - new Date(ultimaMedicion).getTime()) / (60 * 60 * 1000);
  return horas >= HORAS_PARA_AVISAR_ACTUALIZACION;
}

// ---------------------------------------------------------------------------
// Hallazgos (PR 8b, lore doc §5)
//
// El motor decide QUÉ se vio (grupo ganador, perdedor, diferencia, base); aquí
// solo se dice. En pasado, con su red y su base, y sin causa: "tuvieron", nunca
// "funcionan mejor".

/** Cómo se nombra cada formato publicado según dónde cae en la frase. */
export const NOMBRE_FORMATO: Record<
  FormatoPublicado,
  {
    /** "tus carruseles": como sujeto y como término de comparación. */
    plural: string;
    /** "8 carruseles" / "1 carrusel": la base entre paréntesis. */
    conteo: (n: number) => string;
    /** "un carrusel": lo que la propuesta pide hacer. */
    propuesta: string;
  }
> = {
  carrusel: {
    plural: "tus carruseles",
    conteo: (n) => `${String(n)} ${n === 1 ? "carrusel" : "carruseles"}`,
    propuesta: "un carrusel",
  },
  imagen: {
    plural: "tus publicaciones con una imagen",
    conteo: (n) => `${String(n)} con una imagen`,
    propuesta: "una publicación con imagen",
  },
  video: {
    plural: "tus videos",
    conteo: (n) => `${String(n)} ${n === 1 ? "video" : "videos"}`,
    propuesta: "un video",
  },
  texto: {
    plural: "tus publicaciones de solo texto",
    conteo: (n) => `${String(n)} de solo texto`,
    propuesta: "una publicación de solo texto",
  },
};

const DIAS: Record<DiaDeLaSemana, string> = {
  0: "lunes",
  1: "martes",
  2: "miércoles",
  3: "jueves",
  4: "viernes",
  5: "sábado",
  6: "domingo",
};

// `textoDiferencia` y la frase del hallazgo de voz viven en shared
// (`frases-de-hallazgo.ts`): la API escribe con ellas el `mensaje` de la
// propuesta de Configuración, y tienen que decir lo mismo que la tarjeta.
export { textoDiferencia, type FraseDeHallazgo };

export function fraseDeHallazgo(hallazgo: AnaliticasHallazgoDto): FraseDeHallazgo {
  if (hallazgo.tipo === "voz") return fraseDeHallazgoDeVoz(hallazgo);
  const red = NETWORK_LABELS[hallazgo.network];
  const numero = `${textoDiferencia(hallazgo.diferenciaPct)} interacción`;
  if (hallazgo.tipo === "formato") {
    return {
      antes: `En ${red}, ${NOMBRE_FORMATO[hallazgo.ganador].plural} tuvieron `,
      numero,
      despues: ` que ${NOMBRE_FORMATO[hallazgo.perdedor].plural}.`,
    };
  }
  const { ganador } = hallazgo;
  if (ganador === "fin_de_semana") {
    return {
      antes: `En ${red}, lo que publicaste en fin de semana tuvo `,
      numero,
      despues: " que lo de entre semana.",
    };
  }
  if (ganador === "entre_semana") {
    return {
      antes: `En ${red}, lo que publicaste entre semana tuvo `,
      numero,
      despues: " que lo del fin de semana.",
    };
  }
  return {
    antes: `En ${red}, lo que publicaste en ${DIAS[ganador.dia]} tuvo `,
    numero,
    despues: " que el resto de la semana.",
  };
}

/** "Basado en 18 publicaciones de Instagram (8 carruseles, 10 de solo texto)". */
export function baseDeHallazgo(hallazgo: AnaliticasHallazgoDto): string {
  if (hallazgo.tipo === "voz") return baseDeHallazgoDeVoz(hallazgo);
  const total = hallazgo.nGanador + hallazgo.nPerdedor;
  const inicio = `Basado en ${String(total)} publicaciones de ${NETWORK_LABELS[hallazgo.network]}`;
  if (hallazgo.tipo === "formato") {
    const ganador = NOMBRE_FORMATO[hallazgo.ganador].conteo(hallazgo.nGanador);
    const perdedor = NOMBRE_FORMATO[hallazgo.perdedor].conteo(hallazgo.nPerdedor);
    return `${inicio} (${ganador}, ${perdedor})`;
  }
  const { ganador } = hallazgo;
  const [nombreGanador, nombrePerdedor] =
    ganador === "fin_de_semana"
      ? ["en fin de semana", "entre semana"]
      : ganador === "entre_semana"
        ? ["entre semana", "en fin de semana"]
        : [`en ${DIAS[ganador.dia]}`, "el resto de la semana"];
  return `${inicio} (${String(hallazgo.nGanador)} ${nombreGanador}, ${String(hallazgo.nPerdedor)} ${nombrePerdedor})`;
}

/**
 * Lo que "Crear en Chat" deja escrito en la caja de un chat nuevo, sin
 * mandarlo: el tema lo pone el creator, por eso termina en "sobre ".
 */
export function propuestaDeHallazgo(hallazgo: HallazgoFormatoDto): string {
  return `Quiero hacer ${NOMBRE_FORMATO[hallazgo.ganador].propuesta} para ${NETWORK_LABELS[hallazgo.network]} sobre `;
}
