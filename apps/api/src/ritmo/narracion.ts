import {
  etiquetaDeFranja,
  mejoresVentanas,
  type RitmoHorariosDto,
  type RitmoObjetivoDto,
  type SocialNetwork,
} from "@presencia/shared";
import type { ResultadoCadencia } from "../metrics/metrics-engine.service.js";

// La narración de Ritmo: armar el payload y pedir la redacción.
//
// La regla de la que cuelga todo lo demás: **el número sale de SQL, el modelo
// solo lo redacta**. Acá no se calcula nada — el payload se arma con números
// que el motor de métricas ya produjo (ADR-022), y el prompt prohíbe
// explícitamente inventar cualquier cifra que no esté en él.
//
// Es funciones puras a propósito, sin DB ni Nest: lo que hay que poder probar
// de esto es la forma del payload y que el prompt no deje puertas abiertas.

/** Días que se comparan contra los siete anteriores. */
const DIAS_DE_COMPARACION = 7;

/** Cuántas ventanas de horario entran al payload. Tres ya son una sugerencia. */
const MAX_VENTANAS = 3;

export interface VentanaDeNarracion {
  network: SocialNetwork;
  /** "18–21", el rango, nunca una hora exacta: el motor agrupa en bloques. */
  franja: string;
  lift: number;
  heredado: boolean;
}

export interface PayloadDeNarracion {
  /** Semanas que cubre la rejilla de cadencia. */
  semanas: number;
  totalPublicaciones: number;
  ultimos7: number;
  previos7: number;
  rachaActual: number;
  mejorRacha: number;
  objetivos: { network: SocialNetwork; meta: number; hechas: number; sugerido: boolean }[];
  ventanas: VentanaDeNarracion[];
  /** Redes cuyo heatmap todavía no sostiene un "+%", con su motivo. */
  sinHorarios: { network: SocialNetwork; modo: string }[];
}

/**
 * Los números que el modelo va a redactar, y nada más.
 *
 * Lo que NO entra es tan importante como lo que entra: no van los 112 días de
 * la rejilla ni las 56 celdas del heatmap. Un payload con todo invita al
 * modelo a buscarle patrones —"los martes rindes mejor"— que nadie calculó y
 * que nadie puede defender. Va el resumen que el motor ya cerró.
 */
export function armarPayload(
  cadencia: ResultadoCadencia,
  objetivos: readonly RitmoObjetivoDto[],
  horarios: readonly RitmoHorariosDto[],
): PayloadDeNarracion {
  const dias = cadencia.dias;
  const ultimos = dias.slice(-DIAS_DE_COMPARACION);
  const previos = dias.slice(-DIAS_DE_COMPARACION * 2, -DIAS_DE_COMPARACION);

  // La mejor ventana de cada red, de mejor a peor entre redes. `mejoresVentanas`
  // ya devuelve solo lift positivo y solo en modo `full`: una recomendación de
  // dónde te va PEOR no es una recomendación.
  const ventanas = horarios
    .flatMap((red) =>
      mejoresVentanas(red, diaDeMejorLift(red), 1).map((ventana) => ({
        network: red.network,
        franja: etiquetaDeFranja(ventana.franja),
        lift: ventana.lift,
        heredado: ventana.heredado,
      })),
    )
    .sort((a, b) => b.lift - a.lift)
    .slice(0, MAX_VENTANAS);

  return {
    semanas: Math.round(dias.length / 7),
    totalPublicaciones: cadencia.total,
    ultimos7: sumaDe(ultimos),
    previos7: sumaDe(previos),
    rachaActual: cadencia.rachaActual,
    mejorRacha: cadencia.mejorRacha,
    objetivos: objetivos.map((o) => ({
      network: o.network,
      meta: o.meta,
      hechas: o.hechas,
      sugerido: o.sugerido,
    })),
    ventanas,
    sinHorarios: horarios
      .filter((red) => red.modo !== "full")
      .map((red) => ({ network: red.network, modo: red.modo })),
  };
}

/** El día de la semana donde esta red tiene su celda más alta. */
function diaDeMejorLift(horarios: RitmoHorariosDto): number {
  let mejor = { dia: 0, lift: -Infinity };
  for (const celda of horarios.celdas) {
    if (celda.lift !== null && celda.lift > mejor.lift) {
      mejor = { dia: celda.diaSemana, lift: celda.lift };
    }
  }
  return mejor.dia;
}

function sumaDe(dias: readonly { total: number }[]): number {
  return dias.reduce((suma, dia) => suma + dia.total, 0);
}

/**
 * El prompt.
 *
 * La prohibición de inventar cifras está escrita dos veces y con ejemplo, y no
 * es redundancia: es el único invariante que este archivo no puede verificar
 * por su cuenta. La fuente citada de tendencias sí es estructural —un item sin
 * chunk se descarta (grounding.ts)—, pero un porcentaje inventado dentro de un
 * párrafo no se puede detectar después. Lo que sí se puede es no darle materia
 * prima: el payload solo lleva números cerrados.
 */
export function promptDeNarracion(payload: PayloadDeNarracion, nombre: string): string {
  return [
    `Eres el asistente de contenido de ${nombre}, un creator mexicano.`,
    "Redacta en español de México, tuteando, en tono cercano y directo.",
    "Nunca uses 'vos', 'querés', 'tenés' ni ninguna forma rioplatense.",
    "",
    "Estos son sus números de las últimas semanas, ya calculados:",
    "",
    JSON.stringify(payload, null, 2),
    "",
    "Escribe de tres a cuatro frases que le digan cómo va y qué hacer esta semana.",
    "",
    "Reglas:",
    "- NO inventes ningún número. Solo puedes mencionar cifras que estén",
    "  literalmente en el JSON de arriba. Si quieres decir 'creciste un 20%' y",
    "  ese 20 no está ahí, no lo digas: descríbelo en palabras.",
    "- `lift` es el porcentaje contra SU PROPIO promedio en esa red, no contra",
    "  nadie más. `franja` es un rango de tres horas, no una hora exacta:",
    "  escríbelo como rango.",
    "- `heredado: true` significa que el número es de la franja completa y no",
    "  de ese día. Si lo mencionas, dilo con menos certeza.",
    "- `sugerido: true` en una meta significa que él no la eligió, la propusimos",
    "  nosotros. No lo regañes por no cumplir una meta que nunca aceptó.",
    "- Una red en `sinHorarios` todavía no tiene suficiente historial para",
    "  sostener un número, salvo `no_reporta`, que significa que esa red no da",
    "  métricas y nunca las va a dar. No prometas que 'pronto' las tendrá.",
    "- Sin viñetas, sin títulos, sin emojis. Párrafo corrido.",
  ].join("\n");
}
