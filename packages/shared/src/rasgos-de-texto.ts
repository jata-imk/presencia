import { STYLE_NOTES_MAX } from "./brand-voice.js";
import { normalizeHashtags } from "./publication.js";
import { normalizeExpression } from "./text.js";

/**
 * Los rasgos que se leen del texto de una publicación (F12): cuántos emojis,
 * hashtags y signos de exclamación lleva, qué tan largo es y si abre con una
 * pregunta. Los usan dos lectores con distinta evidencia y una sola voz:
 *
 * - «Aprender de mis ediciones» (`voz-viva.ts`): lo que el creator QUITÓ.
 * - El hallazgo de voz de Analíticas (lore doc de Analíticas §5): cómo le FUE
 *   a lo que lleva el rasgo contra lo que no.
 *
 * Los dos proponen el mismo rasgo con el mismo texto ("Casi sin emojis") y
 * deciden igual si «Así escribes» ya lo dice: por eso viven aquí y no en
 * cada uno.
 */

/** El texto de una publicación, sin los hashtags del campo aparte. */
export interface TextoDePublicacion {
  texto: string;
  hashtags: string[];
}

/**
 * El texto de una card como lo lee el creator, sin hashtags (van aparte).
 * Recibe `unknown` porque viene del jsonb de la card o de una versión suya, y
 * una card de forma rara no debe tumbar a quien lee: devuelve `null`.
 *
 * Es lo que escribió: en un video incluye el gancho y el guion, que «Aprender
 * de mis ediciones» sí compara. Para lo que se LEE en la red, `textoPublicado`.
 */
export function textoDePublicacion(content: unknown): TextoDePublicacion | null {
  if (typeof content !== "object" || content === null) return null;
  const c = content as Record<string, unknown>;
  // Normalizados como al publicar: una card de antes de F10.8.4 guardaba
  // "#cafe" o "cafe,merida", y sin esto contarían distinto de lo que sale.
  const hashtags = normalizeHashtags(
    Array.isArray(c.hashtags)
      ? c.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [],
  );
  const s = (valor: unknown) => (typeof valor === "string" ? valor : "");
  switch (c.archetype) {
    case "visual_first":
      return { texto: s(c.caption), hashtags };
    case "video_script":
      return {
        texto: [s(c.hook), s(c.script), s(c.caption)].filter(Boolean).join("\n\n"),
        hashtags,
      };
    case "text_first":
      return { texto: s(c.body), hashtags };
    default:
      return null;
  }
}

/**
 * El texto que la audiencia lee en la red. Igual que `textoDePublicacion`,
 * salvo en un video: ahí el gancho y el guion se DICEN en el video, y lo que
 * se lee es el caption. Los emojis de un guion no los vio nadie.
 */
export function textoPublicado(content: unknown): TextoDePublicacion | null {
  const texto = textoDePublicacion(content);
  if (texto === null) return null;
  const c = content as Record<string, unknown>;
  if (c.archetype !== "video_script") return texto;
  return { texto: typeof c.caption === "string" ? c.caption : "", hashtags: texto.hashtags };
}

// ── Contadores ───────────────────────────────────────────────────────

// Extended_Pictographic también incluye ©, ®, ™, ‼ y ⁉: quitar el ™ de una
// marca no es quitar emojis (revisión de F12.5). Con el selector de emoji
// (U+FE0F, como los ponen los teclados: ‼️) sí son emojis (revisión del PR7).
export const EMOJI = /[©®™‼⁉]️|(?![©®™‼⁉])\p{Extended_Pictographic}/gu;
// `test` con la bandera g guarda estado entre llamadas: para "¿tiene uno?"
// va una copia sin ella.
export const EMOJI_UNO = /[©®™‼⁉]️|(?![©®™‼⁉])\p{Extended_Pictographic}/u;
/** Un hashtag escrito dentro del texto, además de los del campo aparte. */
export const HASHTAG_EN_TEXTO = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

export const contarEmojis = (t: TextoDePublicacion) => t.texto.match(EMOJI)?.length ?? 0;
export const contarHashtags = (t: TextoDePublicacion) =>
  t.hashtags.length + (t.texto.match(HASHTAG_EN_TEXTO)?.length ?? 0);
export const contarExclamaciones = (t: TextoDePublicacion) => t.texto.split("!").length - 1;
export const largoDeTexto = (t: TextoDePublicacion) => t.texto.trim().length;

/**
 * Si la primera oración es una pregunta: abre con "¿" o termina en "?".
 * Lo que va antes de la primera letra (un emoji, un guion) no cuenta: "☕ ¿Ya
 * desayunaste?" abre con pregunta. Un "¿" o un "¡" a media línea empieza otra
 * oración: "Tres apps ¿Cuál usas tú?" abre con una afirmación.
 */
export function abreConPregunta(t: TextoDePublicacion): boolean {
  const inicio = t.texto.replace(/^[^\p{L}\p{N}¿¡]+/u, "");
  if (inicio.startsWith("¿")) return true;
  return /^[^.!?¿¡\n]*([.!?¿¡\n]?)/.exec(inicio)?.[1] === "?";
}

// ── Los rasgos ───────────────────────────────────────────────────────

export const RASGOS_DE_TEXTO = [
  "emojis",
  "hashtags",
  "largo",
  "pregunta",
  "exclamaciones",
] as const;
export type RasgoDeTexto = (typeof RASGOS_DE_TEXTO)[number];

/**
 * De qué lado cayó el ganador. `con` = lleva el rasgo (emojis, hashtags,
 * exclamaciones, abre con pregunta) o, en `largo`, el texto es largo (de la
 * mediana de la red para arriba). `sin` = lo contrario.
 */
export const DIRECCIONES_DE_RASGO = ["con", "sin"] as const;
export type DireccionDeRasgo = (typeof DIRECCIONES_DE_RASGO)[number];

const opuesta = (d: DireccionDeRasgo): DireccionDeRasgo => (d === "con" ? "sin" : "con");

// Las regex se prueban contra el rasgo normalizado (minúsculas, sin acentos).
// Piden la DIRECCIÓN, no solo la palabra: "Usa muchos emojis" no dice "Casi
// sin emojis" (revisión del PR6 de F12.5), y "Pregunta corta" no habla del
// largo del texto.
const MENOS = String.raw`\b(?:sin|pocos?|casi|nunca|evita\w*|quita\w*|cero|ningun\w*|no (?:usa|pone|lleva)\w*)\b[^.]*`;
const MAS = String.raw`\b(?:(?:usa|pon|pone|lleva|incluye|agrega|mete)\w*|con|much[oa]s?|vari[oa]s?)\b[^.]*`;
const TEXTO = String.raw`\b(?:textos?|posts?|publicaciones?|captions?|copys?)\b[^.]*`;
// Los verbos enteros: con raíces sueltas ("abr\w*") "un abrazo" contaría. Con
// "abres": los rasgos del onboarding le hablan de tú ("Abres con una pregunta
// que pica").
const ABRE = String.raw`\b(?:abr(?:e|es|en|ir)|empie(?:za|zas|zan)|empezar|inici(?:a|as|an|ar)|arranc(?:a|as|an|ar)|comienz(?:a|as|an)|comenzar)\b`;

interface Lado {
  /** Lo que se suma a «Así escribes» si este lado ganó. */
  rasgo: string;
  /** El rasgo dice lo mismo, con sus palabras. */
  dice: RegExp;
}

interface Rasgo {
  con: Lado;
  sin: Lado;
}

/**
 * Los `sin` de emojis, hashtags, largo y exclamaciones son los que «Aprender
 * de mis ediciones» ya proponía (F12.5): mismo texto, mismas regex. El lado
 * `con` se calla si el rasgo también dice el `sin` ("No usa emojis" lleva
 * "usa"): ver `rasgoDice`.
 */
const RASGOS: Record<RasgoDeTexto, Rasgo> = {
  emojis: {
    sin: { rasgo: "Casi sin emojis", dice: new RegExp(`${MENOS}\\bemoji`) },
    con: { rasgo: "Usa emojis", dice: new RegExp(`${MAS}\\bemoji`) },
  },
  hashtags: {
    sin: { rasgo: "Pocos hashtags", dice: new RegExp(`${MENOS}\\bhashtag`) },
    con: { rasgo: "Usa hashtags", dice: new RegExp(`${MAS}\\bhashtag`) },
  },
  largo: {
    // "Textos breves", "Al grano": ya lo dijo. "Frases cortas" habla del
    // largo de cada frase, no del texto: no lo dice.
    sin: {
      rasgo: "Textos cortos y al grano",
      dice: new RegExp(`${TEXTO}\\b(?:cort[oa]s?|breves?)\\b|\\bal grano\\b|\\bconcis[oa]s?\\b`),
    },
    con: {
      rasgo: "Textos largos y desarrollados",
      dice: new RegExp(
        `${TEXTO}\\b(?:larg[oa]s?|extens[oa]s?|desarrollad[oa]s?|detallad[oa]s?)\\b`,
      ),
    },
  },
  pregunta: {
    sin: {
      rasgo: "Abre directo, sin pregunta",
      dice: new RegExp(
        `${ABRE}[^.]*\\b(?:sin|nunca|no)\\b[^.]*\\bpregunta|\\b(?:sin|nunca|no)\\b[^.]*${ABRE}[^.]*\\bpregunta|${ABRE}\\s+(?:directo|al grano)`,
      ),
    },
    con: { rasgo: "Abre con una pregunta", dice: new RegExp(`${ABRE}[^.]*\\bpregunta`) },
  },
  exclamaciones: {
    // El "!" suelto solo cuenta del lado `sin` ("Nunca «¡Qué onda!»" sí habla
    // de exclamaciones); del lado `con`, "Saluda con «¡Qué onda!»" no dice
    // que use muchas.
    sin: {
      rasgo: "Pocos signos de exclamación",
      dice: new RegExp(`${MENOS}(?:\\bexclamac|!)`),
    },
    con: { rasgo: "Usa signos de exclamación", dice: new RegExp(`${MAS}\\bexclamac`) },
  },
};

/** Lo que se suma a «Así escribes» si ese lado ganó ("Casi sin emojis"). */
export function rasgoQueSeSuma(rasgo: RasgoDeTexto, direccion: DireccionDeRasgo): string {
  return RASGOS[rasgo][direccion].rasgo;
}

/**
 * Si un rasgo de «Así escribes» ya dice ese lado. El lado `con` además pide
 * que no diga el `sin`: "No usa emojis" lleva "usa", y "Nunca abre con
 * pregunta" lleva "abre con pregunta".
 */
export function rasgoDice(nota: string, rasgo: RasgoDeTexto, direccion: DireccionDeRasgo): boolean {
  const normal = normalizeExpression(nota);
  const { con, sin } = RASGOS[rasgo];
  if (direccion === "sin") return sin.dice.test(normal);
  return con.dice.test(normal) && !sin.dice.test(normal);
}

/**
 * Qué hacer con un rasgo que salió ganador, contra la voz de hoy (lore doc de
 * Analíticas §5):
 *
 * - `ya_lo_dice`: un rasgo suyo dice lo mismo; se muestra sin botón.
 * - `contradice`: un rasgo suyo dice lo contrario; nunca se ofrece "Agregar".
 * - `lleno`: ya tiene los 8; hay que quitar uno.
 * - `propone`: "Agregar a «Así escribes»" / "No".
 */
export type EstadoDeVoz =
  | { estado: "propone" }
  | { estado: "lleno" }
  | { estado: "ya_lo_dice"; rasgo: string }
  | { estado: "contradice"; rasgo: string };

export function estadoDeVoz(
  notas: readonly string[],
  rasgo: RasgoDeTexto,
  direccion: DireccionDeRasgo,
): EstadoDeVoz {
  const igual = notas.find((n) => rasgoDice(n, rasgo, direccion));
  if (igual !== undefined) return { estado: "ya_lo_dice", rasgo: igual };
  const contraria = notas.find((n) => rasgoDice(n, rasgo, opuesta(direccion)));
  if (contraria !== undefined) return { estado: "contradice", rasgo: contraria };
  if (notas.length >= STYLE_NOTES_MAX) return { estado: "lleno" };
  return { estado: "propone" };
}

// ── Partir publicaciones por rasgo ───────────────────────────────────

/**
 * Dónde se parte "corto" de "largo" en una red: la mediana de sus textos.
 * Un corte fijo no sirve: un caption de TikTok y un post de LinkedIn viven en
 * largos distintos, y en cada red lo que importa es corto PARA ELLA.
 * Redondeada, para poder decirla ("de menos de 180 caracteres").
 */
export function corteDeLargo(textos: readonly TextoDePublicacion[]): number {
  const largos = textos.map(largoDeTexto).sort((a, b) => a - b);
  if (largos.length === 0) return 0;
  const medio = Math.floor(largos.length / 2);
  const mediana =
    largos.length % 2 === 1 ? largos[medio]! : (largos[medio - 1]! + largos[medio]!) / 2;
  return Math.round(mediana);
}

/**
 * Si la publicación cae del lado `con`. Emojis, hashtags y exclamaciones:
 * al menos uno contra ninguno. Largo: de `corte` caracteres para arriba.
 */
export function tieneRasgo(rasgo: RasgoDeTexto, t: TextoDePublicacion, corte: number): boolean {
  switch (rasgo) {
    case "emojis":
      return contarEmojis(t) > 0;
    case "hashtags":
      return contarHashtags(t) > 0;
    case "exclamaciones":
      return contarExclamaciones(t) > 0;
    case "pregunta":
      return abreConPregunta(t);
    case "largo":
      return largoDeTexto(t) >= corte;
  }
}
