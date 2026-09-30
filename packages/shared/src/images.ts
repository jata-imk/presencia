import { z } from "zod";
import { imageStyleSchema, type ImageStyle } from "./image-styles.js";
import type { SocialNetwork } from "./publication.js";

// F10: generar la imagen de una card (ADR-025). Lo que comparten la API y el
// navegador: las proporciones que se piden, qué se manda al generar y cómo
// viaja el estado del trabajo en la card.

/** Las proporciones que la app pide. Cada adapter las traduce a lo que su API entiende. */
export const IMAGE_ASPECT_RATIOS = ["1:1", "4:5", "16:9"] as const;
export const imageAspectRatioSchema = z.enum(IMAGE_ASPECT_RATIOS);
export type ImageAspectRatio = z.infer<typeof imageAspectRatioSchema>;

/**
 * Qué proporciones ofrece la card para cada red; la primera es la default.
 * Solo formatos de feed: stories y reels no son del arquetipo visual (chat §4).
 *
 * - Instagram y Facebook: 4:5, lo más alto que el feed muestra sin recortar.
 * - LinkedIn: cuadrada, que el feed muestra entera en móvil y escritorio.
 * - X: 16:9, lo único que la línea de tiempo no recorta.
 * - Threads: 4:5 como Instagram, de donde viene su feed.
 *
 * Las redes de video no llevan imagen: lista vacía.
 */
export const IMAGE_ASPECT_OPTIONS: Record<SocialNetwork, readonly ImageAspectRatio[]> = {
  instagram: ["4:5", "1:1"],
  facebook: ["4:5", "1:1"],
  linkedin: ["1:1", "16:9"],
  x: ["16:9", "1:1"],
  threads: ["4:5", "1:1"],
  tiktok: [],
  youtube: [],
};

/** "primary" es el generador de siempre; "alternate", el de "Probar con otro generador". */
export const imageProviderSlotSchema = z.enum(["primary", "alternate"]);
export type ImageProviderSlot = z.infer<typeof imageProviderSlotSchema>;

/**
 * Lo que manda "Generar imagen". El prompt viaja siempre, aunque sea el que
 * sugirió el chat: el usuario lo pudo editar antes de apretar, y lo que se
 * genera es lo que vio en pantalla, no lo que quedó guardado.
 */
export const generateCardImageBodySchema = z.object({
  provider: imageProviderSlotSchema.default("primary"),
  /** Obligatorio en una imagen suelta; en un carrusel cada slide trae el suyo. */
  prompt: z.string().trim().min(3).max(2000).optional(),
  aspectRatio: imageAspectRatioSchema,
  /**
   * F10.6: en un carrusel, qué slides generar (uno, o "los que faltan" en un
   * solo trabajo). Cada uno con su propio prompt; la portada lleva dos
   * variantes y el resto una. Obligatorio en carruseles, prohibido fuera.
   */
  slideIds: z.array(z.uuid()).min(1).max(10).optional(),
  /**
   * F10.6: el estilo de ESTA imagen (el chip del composer). Sin él, el de la
   * Voz de marca.
   */
  style: imageStyleSchema.optional(),
});
export type GenerateCardImageBody = z.infer<typeof generateCardImageBodySchema>;

/**
 * Elegir otra de las imágenes de la card (una variante, una versión
 * anterior). F10.6: en un carrusel va al slide `slideId` (o a la portada).
 */
export const selectCardImageBodySchema = z.object({
  assetId: z.uuid(),
  slideId: z.uuid().optional(),
});
export type SelectCardImageBody = z.infer<typeof selectCardImageBodySchema>;

/**
 * El último trabajo de imagen de la card, tal como lo ve el navegador.
 *
 * - `generating`: el job está corriendo (10 a 60 s).
 * - `done`: terminó y al menos una imagen salió. `assetIds` son las que salieron.
 * - `failed`: el sistema falló (red, proveedor caído). No se cobró.
 * - `blocked`: el proveedor se negó a dibujar lo pedido. No se cobró.
 */
export interface CardImageJob {
  id: string;
  status: "generating" | "done" | "failed" | "blocked";
  provider: ImageProviderSlot;
  kind: "generate" | "edit";
  /** La proporción pedida: con ella la card dibuja el hueco mientras genera. */
  aspectRatio: ImageAspectRatio;
  /**
   * F10.6: el estilo con que se generó. El chip del composer arranca en él,
   * así "Regenerar" y "Probar con otro generador" lo repiten.
   * Una edición no lo aplica (conserva el de su imagen) pero lo hereda del
   * trabajo anterior, para que el chip no caiga al default. Ausente en
   * trabajos anteriores a F10.6.
   */
  style?: ImageStyle;
  /** F10.6: los slides que este trabajo está llenando (ausente = la imagen suelta). */
  slideIds?: string[];
  assetIds: string[];
  startedAt: string;
}

/**
 * Cuánto dura "generando" antes de darlo por muerto. Un job que no termina
 * —el worker se reinició a la mitad— dejaría el botón apagado para siempre;
 * pasado esto la card lo muestra como fallido y deja volver a intentar.
 * Holgado a propósito: gpt-image tarda hasta ~2 min en los prompts pesados.
 */
export const IMAGE_JOB_STALE_MS = 5 * 60 * 1000;

/**
 * Lo que la card necesita para ofrecer la generación: el precio, siempre como
 * porcentaje del mes y nunca en unidades (addendum ADR-012), y si hay un
 * segundo generador configurado.
 */
export interface ImagesConfigDto {
  /** Un click en "Generar": dos variantes. */
  generatePercent: number;
  /** Una edición con instrucción: una imagen. También un slide que no es la portada. */
  editPercent: number;
  alternateAvailable: boolean;
  /** F10.6: el estilo de la Voz de marca (Fotográfico si nunca eligió): con él arranca el chip. */
  defaultStyle: ImageStyle;
}

/** Cuántas imágenes produce un click en "Generar" (decisión de producto de F10). */
export const IMAGE_VARIANTS_PER_GENERATION = 2;

// ── F10 PR4: iterar la imagen ─────────────────────────────────────────

/**
 * "Más cálida", "sin gente": se edita la imagen elegida, con ella como
 * referencia, en vez de generar otra desde cero. Una sola imagen: la
 * instrucción ya dice qué cambiar, no hay nada que elegir entre dos.
 */
export const editCardImageBodySchema = z.object({
  instruction: z.string().trim().min(3).max(500),
  provider: imageProviderSlotSchema.default("primary"),
  /** F10.6: en un carrusel, el slide cuya imagen se ajusta (sin él, la portada). */
  slideId: z.uuid().optional(),
});
export type EditCardImageBody = z.infer<typeof editCardImageBodySchema>;

/**
 * Los atajos de la card (mock: "Regenerar imagen" con dirección y "Variar
 * estilo"). La etiqueta es lo que se ve; la instrucción, lo que se le pide al
 * generador.
 */
export const IMAGE_EDIT_SUGGESTIONS = [
  { label: "Más cálida", instruction: "Hazla más cálida, con luz dorada." },
  { label: "Otro fondo", instruction: "Cambia el fondo por otro que combine con el tema." },
  { label: "Más minimalista", instruction: "Hazla más minimalista, con menos elementos." },
  { label: "Más colorida", instruction: "Hazla más colorida y vibrante." },
  { label: "Ilustración", instruction: "Conviértela en una ilustración, conservando la escena." },
] as const;

/**
 * Una imagen de la card en su historial (todas las que tuvo: generadas,
 * editadas, subidas). Es lo que ve la tira de versiones y, en F12,
 * Biblioteca.
 */
export interface CardImageVersionDto {
  assetId: string;
  source: "generated" | "uploaded";
  /** Solo las generadas: si salió de cero o editando otra. */
  kind: "generate" | "edit" | null;
  /** Solo las ediciones: lo que se pidió ("Quita a las personas"). */
  instruction: string | null;
  /** De qué imagen salió una edición: el linaje. */
  parentAssetId: string | null;
  /** Texto alternativo; null si nadie lo escribió (las subidas nacen sin él). */
  alt: string | null;
  createdAt: string;
}

export const updateAssetAltBodySchema = z.object({ alt: z.string().trim().max(500) });
export type UpdateAssetAltBody = z.infer<typeof updateAssetAltBodySchema>;
