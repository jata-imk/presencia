import type { HallazgoVozDto } from "./analiticas.js";
import { NETWORK_LABELS } from "./post-text.js";
import type { DireccionDeRasgo, RasgoDeTexto } from "./rasgos-de-texto.js";

// Cómo se DICE un hallazgo (lore doc de Analíticas §5): en pasado, con su red
// y su base, y sin causa ("tuvieron", nunca "funcionan mejor").
//
// El contrato de Analíticas manda números y no copy, y la mayoría de las
// frases vive en la web (`lib/analiticas/formato.ts`). Las del hallazgo de voz
// están aquí porque tienen dos lectores: la tarjeta de Analíticas y la
// propuesta de Configuración › Voz de marca, cuyo `mensaje` escribe la API
// (como el de «Aprender de mis ediciones»). Una sola frase para los dos.

const entero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/**
 * "31% más" o, desde el doble, "2.4 veces más" (lore doc §5). `diferenciaPct`
 * es cuánto MÁS rindió el ganador, así que el múltiplo es 1 + pct/100.
 */
export function textoDiferencia(diferenciaPct: number): string {
  // Se redondea antes de decidir: un 99.6 que se diría "100% más" ya es el doble.
  const pct = Math.round(diferenciaPct);
  const veces = 1 + pct / 100;
  if (veces >= 2) return `${unDecimal.format(Math.round(veces * 10) / 10)} veces más`;
  return `${entero.format(pct)}% más`;
}

/** La frase de un hallazgo en tres partes: la del medio va en `strong`. */
export interface FraseDeHallazgo {
  antes: string;
  numero: string;
  despues: string;
}

interface Dicho {
  /** "tus publicaciones sin emojis": el sujeto de la frase. */
  sujeto: string;
  /** "que las que sí llevan": contra qué. */
  contra: string;
  /** "6 sin": la base entre paréntesis. */
  conteo: (n: number) => string;
}

function dichoDe(rasgo: RasgoDeTexto, lado: DireccionDeRasgo, corte: number | null): Dicho {
  const con = lado === "con";
  const n = (valor: number) => String(valor);
  switch (rasgo) {
    case "emojis":
    case "hashtags": {
      const palabra = rasgo;
      return {
        sujeto: `tus publicaciones ${con ? "con" : "sin"} ${palabra}`,
        contra: con ? "que las que no llevan" : "que las que sí llevan",
        conteo: (v) => `${n(v)} ${con ? "con" : "sin"}`,
      };
    }
    case "exclamaciones":
      return {
        sujeto: `tus publicaciones ${con ? "con" : "sin"} signos de exclamación`,
        contra: con ? "que las que no llevan" : "que las que sí llevan",
        conteo: (v) => `${n(v)} ${con ? "con" : "sin"}`,
      };
    case "pregunta":
      return {
        sujeto: con
          ? "tus publicaciones que abren con una pregunta"
          : "tus publicaciones que no abren con una pregunta",
        contra: con ? "que las que no" : "que las que sí",
        conteo: (v) => (con ? `${n(v)} con pregunta` : `${n(v)} sin pregunta`),
      };
    case "largo": {
      const caracteres = entero.format(corte ?? 0);
      return {
        sujeto: con
          ? `tus publicaciones de ${caracteres} caracteres o más`
          : `tus publicaciones de menos de ${caracteres} caracteres`,
        contra: con ? "que las más cortas" : "que las más largas",
        conteo: (v) => `${n(v)} ${con ? "más largas" : "más cortas"}`,
      };
    }
  }
}

/**
 * "En Instagram, tus publicaciones sin emojis tuvieron **31% más interacción**
 * que las que sí llevan."
 */
export function fraseDeHallazgoDeVoz(hallazgo: HallazgoVozDto): FraseDeHallazgo {
  const dicho = dichoDe(hallazgo.rasgo, hallazgo.ganador, hallazgo.corte);
  return {
    antes: `En ${NETWORK_LABELS[hallazgo.network]}, ${dicho.sujeto} tuvieron `,
    numero: `${textoDiferencia(hallazgo.diferenciaPct)} interacción`,
    despues: ` ${dicho.contra}.`,
  };
}

/** "Basado en 14 publicaciones de Instagram (6 sin, 8 con)". El ganador primero. */
export function baseDeHallazgoDeVoz(hallazgo: HallazgoVozDto): string {
  const perdedor = hallazgo.ganador === "con" ? "sin" : "con";
  const ganador = dichoDe(hallazgo.rasgo, hallazgo.ganador, hallazgo.corte);
  const otro = dichoDe(hallazgo.rasgo, perdedor, hallazgo.corte);
  const total = hallazgo.nGanador + hallazgo.nPerdedor;
  return `Basado en ${String(total)} publicaciones de ${NETWORK_LABELS[hallazgo.network]} (${ganador.conteo(hallazgo.nGanador)}, ${otro.conteo(hallazgo.nPerdedor)})`;
}
