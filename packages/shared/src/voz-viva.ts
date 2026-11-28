import { z } from "zod";
import { socialNetworkSchema, type SocialNetwork } from "./publication.js";
import {
  DIRECCIONES_DE_RASGO,
  EMOJI_UNO,
  HASHTAG_EN_TEXTO,
  RASGOS_DE_TEXTO,
  contarEmojis,
  contarExclamaciones,
  contarHashtags,
  largoDeTexto,
  rasgoDice,
  rasgoQueSeSuma,
  type DireccionDeRasgo,
  type RasgoDeTexto,
  type TextoDePublicacion,
} from "./rasgos-de-texto.js";
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
  /**
   * La regla (`emojis`…); si salió de «Revisar mis ediciones», `ia-<n>`; si
   * salió de un hallazgo de Analíticas, `m-<rasgo>-<ganador>-<red>`.
   */
  id: string;
  origen: "regla" | "ia" | "metricas";
  /**
   * Lo que el creator lee: "Quitaste emojis en 4 de tus últimas 5
   * publicaciones." o, de métricas, la frase del hallazgo.
   */
  mensaje: string;
  /** Lo que se suma a «Así escribes» si dice "Agregar". */
  rasgo: string;
  /** Vacía en las de métricas: su evidencia es el hallazgo. */
  evidencia: EvidenciaDeVoz[];
  /**
   * Solo de métricas: las llaves de otras redes que proponen el mismo rasgo y
   * se juntaron en esta tarjeta. Un "No" las anota todas.
   */
  otrosIds?: string[];
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

/** La llave de un hallazgo de voz de Analíticas: `m-emojis-sin-instagram`. */
export type IdDeHallazgoDeVoz = `m-${RasgoDeTexto}-${DireccionDeRasgo}-${string}`;

export function idDeHallazgoDeVoz(
  rasgo: RasgoDeTexto,
  ganador: DireccionDeRasgo,
  red: SocialNetwork,
): IdDeHallazgoDeVoz {
  return `m-${rasgo}-${ganador}-${red}`;
}

const ID_DE_HALLAZGO_DE_VOZ = new RegExp(
  `^m-(?:${RASGOS_DE_TEXTO.join("|")})-(?:${DIRECCIONES_DE_RASGO.join("|")})-(?:${socialNetworkSchema.options.join("|")})$`,
);

/** Una propuesta sobre la que se puede decidir: una regla o un hallazgo de voz. */
export type IdDePropuestaDeVoz = ReglaDeVozViva | IdDeHallazgoDeVoz;

export const idDePropuestaDeVozSchema = z.union([
  reglaDeVozVivaSchema,
  z
    .string()
    .regex(ID_DE_HALLAZGO_DE_VOZ)
    .transform((id) => id as IdDeHallazgoDeVoz),
]);

/**
 * `brand_voices.voice_proposal_decisions`: la última decisión por regla y por
 * hallazgo de voz. Una sola columna para las dos (decidido con Jose en el PR 9
 * de F12): es la misma pregunta ("¿esto es tu voz?") con otra evidencia.
 */
export type DecisionesDeVoz = Partial<
  Record<IdDePropuestaDeVoz, { decision: DecisionDeVoz; at: string }>
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
  for (const [llave, decision] of Object.entries(parsed.data)) {
    const id = idDePropuestaDeVozSchema.safeParse(llave);
    if (id.success) salida[id.data] = decision;
  }
  return salida;
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
//
// Los contadores y el texto de cada rasgo viven en `rasgos-de-texto.ts`: el
// hallazgo de voz de Analíticas propone los mismos ("Casi sin emojis") y
// decide igual si «Así escribes» ya lo dice. Cada regla de aquí es el lado
// `sin` de un rasgo: lo que el creator quitó.

const largo = largoDeTexto;

interface Regla {
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
    aplica: (o) => contarEmojis(o) > 0,
    cumple: reducido(contarEmojis),
    mensaje: (c, n) => `Quitaste emojis ${deTus(c, n)}.`,
    evidencia: (e) => lineaConCambio(e, (linea) => EMOJI_UNO.test(linea)),
  },
  hashtags: {
    aplica: (o) => contarHashtags(o) >= 2,
    cumple: reducido(contarHashtags),
    mensaje: (c, n) => `Quitaste hashtags ${deTus(c, n)}.`,
    evidencia: (e) => ({
      antes: recortar(lineaDeHashtags(e.original)),
      despues: recortar(lineaDeHashtags(e.final)) || "Sin hashtags",
    }),
  },
  largo: {
    // Recortar un texto de dos líneas no dice nada del creator.
    aplica: (o) => largo(o) >= 120,
    cumple: (o, f) => largo(f) <= largo(o) * 0.7,
    mensaje: (c, n) => `Recortaste el texto ${deTus(c, n)}.`,
    evidencia: (e) => ({ antes: recortar(e.original.texto), despues: recortar(e.final.texto) }),
  },
  exclamaciones: {
    aplica: (o) => contarExclamaciones(o) > 0,
    cumple: reducido(contarExclamaciones),
    mensaje: (c, n) => `Quitaste signos de exclamación ${deTus(c, n)}.`,
    evidencia: (e) => lineaConCambio(e, (linea) => linea.includes("!")),
  },
};

/** El rasgo que propone una regla ("Casi sin emojis"): el lado `sin` del rasgo. */
export function rasgoDeRegla(regla: ReglaDeVozViva): string {
  return rasgoQueSeSuma(regla, "sin");
}

/**
 * Si un rasgo ya dice lo que propone la regla ("Sin emojis" cubre a la de
 * emojis). Lo usa «Revisar mis ediciones» para no repetir con la IA una
 * propuesta que la regla ya está haciendo.
 */
export function rasgoCubreRegla(rasgo: string, regla: ReglaDeVozViva): boolean {
  return rasgoDice(rasgo, regla, "sin");
}

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
      rasgo: rasgoDeRegla(id),
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
