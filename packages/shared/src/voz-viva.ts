import { z } from "zod";
import { normalizeHashtags } from "./publication.js";
import { normalizeExpression } from "./text.js";

/**
 * «Aprender de mis ediciones» (F12.5, voz viva). Cuando el creator edita un
 * borrador antes de programarlo, la diferencia entre lo que escribió la IA y
 * lo que él publicó dice algo de su voz. Aquí viven las reglas deterministas
 * (gratis, sin modelo) que notan un patrón y PROPONEN un rasgo para «Así
 * escribes». Nunca cambian la voz solas: el creator dice "Agregar" o "No"
 * (doc de Voz de marca §8: propone, nunca cambia sola).
 *
 * Puro y en shared para probarlo sin base de datos y para que la pantalla y
 * la API hablen de las mismas reglas.
 */

/** El texto de una publicación, sin los hashtags del campo aparte. */
export interface TextoDePublicacion {
  texto: string;
  hashtags: string[];
}

/** Lo que escribió la IA (versión 1 de la card) contra lo que se programó. */
export interface EdicionDePublicacion {
  original: TextoDePublicacion;
  final: TextoDePublicacion;
  /** ISO 8601: la última edición, o cuándo nació la card si nunca se editó. */
  momento: string;
}

export const REGLAS_DE_VOZ_VIVA = ["emojis", "hashtags", "largo", "exclamaciones"] as const;
export type ReglaDeVozViva = (typeof REGLAS_DE_VOZ_VIVA)[number];
export const reglaDeVozVivaSchema = z.enum(REGLAS_DE_VOZ_VIVA);

/**
 * El umbral: de las últimas 6 publicaciones donde la regla aplica, en al menos
 * 4 se ve el cambio. Con menos de 4 no hay patrón, hay anécdota; y una
 * propuesta que no se sostiene enseña al creator a ignorarlas todas.
 */
export const VOZ_VIVA_VENTANA = 6;
export const VOZ_VIVA_MINIMO = 4;

/** «Revisar mis ediciones» (con IA): cuántas ediciones mira, como mínimo y como máximo. */
export const REVISAR_EDICIONES_MINIMO = 2;
export const REVISAR_EDICIONES_MAX = 10;

export interface EvidenciaDeVoz {
  antes: string;
  despues: string;
}

export interface PropuestaDeVozDto {
  /** La regla (`emojis`…) o, si salió de «Revisar mis ediciones», `ia-<n>`. */
  id: string;
  origen: "regla" | "ia";
  /** Lo que el creator lee: "Quitaste emojis en 4 de tus últimas 5 publicaciones." */
  mensaje: string;
  /** Lo que se suma a «Así escribes» si dice "Agregar". */
  rasgo: string;
  evidencia: EvidenciaDeVoz[];
}

export interface PropuestasDeVozDto {
  /** «Aprender de mis ediciones» prendido. Apagado, no hay propuestas. */
  aprender: boolean;
  propuestas: PropuestaDeVozDto[];
  /** Cuántas publicaciones editadas puede mirar «Revisar mis ediciones» (≤ 10). */
  edicionesParaRevisar: number;
}

export interface RevisionDeEdicionesDto {
  propuestas: PropuestaDeVozDto[];
}

export const aprenderDeEdicionesBodySchema = z.object({ aprender: z.boolean() });

export const DECISIONES_DE_VOZ = ["aceptada", "descartada"] as const;
export const decisionDeVozBodySchema = z.object({ decision: z.enum(DECISIONES_DE_VOZ) });
export type DecisionDeVoz = (typeof DECISIONES_DE_VOZ)[number];

/** `brand_voices.voice_proposal_decisions`: la última decisión por regla. */
export type DecisionesDeVoz = Partial<
  Record<ReglaDeVozViva, { decision: DecisionDeVoz; at: string }>
>;

const decisionesSchema = z.record(
  z.string(),
  z.object({ decision: z.enum(DECISIONES_DE_VOZ), at: z.string() }),
);

/** jsonb sin tipo en la base: lo que no tenga la forma esperada se ignora. */
export function decisionesDeVoz(valor: unknown): DecisionesDeVoz {
  const parsed = decisionesSchema.safeParse(valor);
  if (!parsed.success) return {};
  const salida: DecisionesDeVoz = {};
  for (const [regla, decision] of Object.entries(parsed.data)) {
    const id = reglaDeVozVivaSchema.safeParse(regla);
    if (id.success) salida[id.data] = decision;
  }
  return salida;
}

/**
 * El texto de una card como lo lee el creator, sin hashtags (van aparte).
 * Recibe `unknown` porque viene del jsonb de la card o de su versión 1, y una
 * card de forma rara no debe tumbar las propuestas: devuelve `null`.
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

/** Si el creator cambió algo del texto o de los hashtags. */
export function fueEditada(edicion: EdicionDePublicacion): boolean {
  const { original, final } = edicion;
  return (
    original.texto.trim() !== final.texto.trim() ||
    original.hashtags.map(normalizeExpression).join(" ") !==
      final.hashtags.map(normalizeExpression).join(" ")
  );
}

// ── Las reglas ───────────────────────────────────────────────────────

// Extended_Pictographic también incluye ©, ®, ™, ‼ y ⁉: quitar el ™ de una
// marca no es quitar emojis (revisión de la fase). Con el selector de emoji
// (U+FE0F, como los ponen los teclados: ‼️) sí son emojis (revisión del PR7).
const EMOJI = /[©®™‼⁉]\uFE0F|(?![©®™‼⁉])\p{Extended_Pictographic}/gu;
// Un hashtag escrito dentro del texto, además de los del campo aparte.
const HASHTAG_EN_TEXTO = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

const contarEmojis = (t: TextoDePublicacion) => t.texto.match(EMOJI)?.length ?? 0;
const contarHashtags = (t: TextoDePublicacion) =>
  t.hashtags.length + (t.texto.match(HASHTAG_EN_TEXTO)?.length ?? 0);
const contarExclamaciones = (t: TextoDePublicacion) => t.texto.split("!").length - 1;
const largo = (t: TextoDePublicacion) => t.texto.trim().length;

interface Regla {
  /** El rasgo que se propone para «Así escribes». */
  rasgo: string;
  /**
   * Si un rasgo (ya normalizado: minúsculas, sin acentos) dice lo mismo que la
   * regla con sus palabras ("Sin emojis"), proponer "Casi sin emojis" sería
   * repetirle. Pide la misma DIRECCIÓN, no solo la palabra: "Usa muchos
   * emojis" no la calla (revisión del PR6), y "Pregunta corta" tampoco calla
   * la de largo.
   */
  cubre: RegExp;
  /** Si el borrador de la IA tenía de qué quitar. Si no, no es evidencia ni a favor ni en contra. */
  aplica: (original: TextoDePublicacion) => boolean;
  /** Si el creator lo quitó (o lo redujo a la mitad o menos). */
  cumple: (original: TextoDePublicacion, final: TextoDePublicacion) => boolean;
  mensaje: (cumplen: number, de: number) => string;
  evidencia: (edicion: EdicionDePublicacion) => EvidenciaDeVoz;
}

const deTus = (cumplen: number, de: number) =>
  `en ${String(cumplen)} de tus últimas ${String(de)} publicaciones`;

/** "Lo quitó o lo dejó en la mitad o menos". */
const reducido =
  (contar: (t: TextoDePublicacion) => number) => (o: TextoDePublicacion, f: TextoDePublicacion) =>
    contar(f) <= Math.floor(contar(o) / 2);

const REGLAS: Record<ReglaDeVozViva, Regla> = {
  emojis: {
    rasgo: "Casi sin emojis",
    cubre:
      /\b(?:sin|pocos?|casi|nunca|evita\w*|quita\w*|cero|ningun\w*|no (?:usa|pone|lleva)\w*)\b[^.]*\bemoji/,
    aplica: (o) => contarEmojis(o) > 0,
    cumple: reducido(contarEmojis),
    mensaje: (c, n) => `Quitaste emojis ${deTus(c, n)}.`,
    evidencia: (e) => lineaConCambio(e, (linea) => EMOJI_UNO.test(linea)),
  },
  hashtags: {
    rasgo: "Pocos hashtags",
    cubre:
      /\b(?:sin|pocos?|casi|nunca|evita\w*|quita\w*|cero|ningun\w*|no (?:usa|pone|lleva)\w*)\b[^.]*\bhashtag/,
    aplica: (o) => contarHashtags(o) >= 2,
    cumple: reducido(contarHashtags),
    mensaje: (c, n) => `Quitaste hashtags ${deTus(c, n)}.`,
    evidencia: (e) => ({
      antes: recortar(lineaDeHashtags(e.original)),
      despues: recortar(lineaDeHashtags(e.final)) || "Sin hashtags",
    }),
  },
  largo: {
    rasgo: "Textos cortos y al grano",
    // "Textos breves", "Al grano": ya lo dijo. "Frases cortas" habla del
    // largo de cada frase, no del texto: no la calla.
    cubre:
      /\b(?:textos?|posts?|publicaciones?|captions?|copys?)\b[^.]*\b(?:cort[oa]s?|breves?)\b|\bal grano\b|\bconcis[oa]s?\b/,
    // Recortar un texto de dos líneas no dice nada del creator.
    aplica: (o) => largo(o) >= 120,
    cumple: (o, f) => largo(f) <= largo(o) * 0.7,
    mensaje: (c, n) => `Recortaste el texto ${deTus(c, n)}.`,
    evidencia: (e) => ({ antes: recortar(e.original.texto), despues: recortar(e.final.texto) }),
  },
  exclamaciones: {
    rasgo: "Pocos signos de exclamación",
    cubre:
      /\b(?:sin|pocos?|casi|nunca|evita\w*|quita\w*|cero|ningun\w*|no (?:usa|pone|lleva)\w*)\b[^.]*(?:\bexclamac|!)/,
    aplica: (o) => contarExclamaciones(o) > 0,
    cumple: reducido(contarExclamaciones),
    mensaje: (c, n) => `Quitaste signos de exclamación ${deTus(c, n)}.`,
    evidencia: (e) => lineaConCambio(e, (linea) => linea.includes("!")),
  },
};

/** El rasgo que propone una regla ("Casi sin emojis"). */
export function rasgoDeRegla(regla: ReglaDeVozViva): string {
  return REGLAS[regla].rasgo;
}

/**
 * Si un rasgo ya dice lo que propone la regla ("Sin emojis" cubre a la de
 * emojis). Lo usa «Revisar mis ediciones» para no repetir con la IA una
 * propuesta que la regla ya está haciendo.
 */
export function rasgoCubreRegla(rasgo: string, regla: ReglaDeVozViva): boolean {
  return REGLAS[regla].cubre.test(normalizeExpression(rasgo));
}

// `test` con la bandera g guarda estado entre llamadas: para "¿tiene uno?"
// va una copia sin ella.
const EMOJI_UNO = /[©®™‼⁉]\uFE0F|(?![©®™‼⁉])\p{Extended_Pictographic}/u;

/** Cuántas evidencias se muestran por propuesta: dos se leen de un vistazo. */
const EVIDENCIAS_MAX = 2;

/**
 * Las propuestas que salen de las ediciones, una por regla como máximo.
 *
 * - Solo cuentan las publicaciones POSTERIORES a la última decisión sobre esa
 *   regla: un "No" no se vuelve a preguntar con la misma evidencia.
 * - Si un rasgo suyo ya lo dice, no se propone.
 * - Las que no se editaron también cuentan: programar un borrador con sus
 *   emojis intactos es evidencia de que los emojis le parecieron bien.
 */
export function proponerAjustesDeVoz(
  ediciones: readonly EdicionDePublicacion[],
  contexto: { rasgos: readonly string[]; decisiones: DecisionesDeVoz },
): PropuestaDeVozDto[] {
  const rasgos = contexto.rasgos;
  const recientes = [...ediciones].sort((a, b) => Date.parse(b.momento) - Date.parse(a.momento));
  const propuestas: PropuestaDeVozDto[] = [];

  for (const id of REGLAS_DE_VOZ_VIVA) {
    const regla = REGLAS[id];
    if (rasgos.some((rasgo) => rasgoCubreRegla(rasgo, id))) continue;

    const decididaEn = contexto.decisiones[id]?.at;
    const desde = decididaEn ? Date.parse(decididaEn) : -Infinity;
    const consideradas = recientes
      .filter((e) => Date.parse(e.momento) > desde && regla.aplica(e.original))
      .slice(0, VOZ_VIVA_VENTANA);
    const cumplen = consideradas.filter((e) => regla.cumple(e.original, e.final));
    if (cumplen.length < VOZ_VIVA_MINIMO) continue;

    propuestas.push({
      id,
      origen: "regla",
      mensaje: regla.mensaje(cumplen.length, consideradas.length),
      rasgo: regla.rasgo,
      evidencia: cumplen.slice(0, EVIDENCIAS_MAX).map(regla.evidencia),
    });
  }
  return propuestas;
}

// ── Evidencia ────────────────────────────────────────────────────────

const EVIDENCIA_MAX_LARGO = 90;

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > EVIDENCIA_MAX_LARGO
    ? `${limpio.slice(0, EVIDENCIA_MAX_LARGO - 1).trimEnd()}…`
    : limpio;
}

function lineaDeHashtags(t: TextoDePublicacion): string {
  const enTexto = (t.texto.match(HASHTAG_EN_TEXTO) ?? []).map((tag) => tag.trim());
  const delCampo = t.hashtags.map((tag) => `#${tag}`);
  return [...enTexto, ...delCampo].join(" ");
}

function lineas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean);
}

/** Las palabras de una línea, sin emojis ni signos: para encontrar su pareja editada. */
function palabras(linea: string): Set<string> {
  return new Set(
    normalizeExpression(linea)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((p) => p.length > 2),
  );
}

/**
 * La línea del borrador donde está lo que se quitó, y la línea del final que
 * más se le parece (por palabras en común). Mostrar el post completo
 * escondería el cambio; la línea lo deja a la vista.
 */
function lineaConCambio(
  edicion: EdicionDePublicacion,
  tieneLoQuitado: (linea: string) => boolean,
): EvidenciaDeVoz {
  const delBorrador = lineas(edicion.original.texto);
  const antes = delBorrador.find(tieneLoQuitado) ?? delBorrador[0] ?? "";
  const clave = palabras(antes);
  let despues = "";
  let mejor = -1;
  for (const linea of lineas(edicion.final.texto)) {
    const comunes = [...palabras(linea)].filter((p) => clave.has(p)).length;
    if (comunes > mejor) {
      mejor = comunes;
      despues = linea;
    }
  }
  return { antes: recortar(antes), despues: recortar(despues) };
}
