import { z } from "zod";
import { socialNetworkSchema } from "./publication.js";
import { macroRegionIdSchema, verticalIdSchema } from "./verticals.js";

// El contrato de las tendencias de Ritmo.
//
// Dos reglas del producto viven en la FORMA de estos tipos, no en el copy que
// los pinta, y esa es la idea: una regla que solo existe en un prompt o en un
// componente se incumple sin que nada falle.
//
//   1. **Nunca un "+%".** La fuerza de una tendencia es cualitativa
//      (🔥 subiendo / 📈 estable / ✨ nueva) porque no hay de dónde sacar un
//      porcentaje real del movimiento de un tema en una red. Por eso no existe
//      un campo numérico que alguien pueda llenar "provisionalmente".
//   2. **Fuente citada siempre.** `sourceUrl` y `sourceTitle` son
//      obligatorios, así que un item sin procedencia no puede construirse.

export const TREND_SIGNALS = ["rising", "stable", "new"] as const;
export const trendSignalSchema = z.enum(TREND_SIGNALS);
export type TrendSignal = z.infer<typeof trendSignalSchema>;

/**
 * Los formatos que Ritmo sabe proponer.
 *
 * Cerrado y no texto libre porque el filtro de la UI y las propuestas de
 * publicación se agrupan por él: con formatos libres, "Reel" y "reel" serían
 * dos pestañas.
 */
export const TREND_FORMATS = ["reel", "carrusel", "post", "video", "historia"] as const;
export const trendFormatSchema = z.enum(TREND_FORMATS);
export type TrendFormat = z.infer<typeof trendFormatSchema>;

export const trendItemSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  signal: trendSignalSchema,
  network: socialNetworkSchema,
  format: trendFormatSchema,
  blurb: z.string().trim().min(1).max(600),
  /** Título de la página citada, tal como lo reportó la búsqueda. */
  sourceTitle: z.string().trim().min(1).max(300),
  /** URL de la página citada. Sin esto el item no existe. */
  sourceUrl: z.url(),
});
export type TrendItem = z.infer<typeof trendItemSchema>;

export const trendsDtoSchema = z.object({
  vertical: verticalIdSchema,
  region: macroRegionIdSchema,
  items: z.array(trendItemSchema),
  /** Cuándo se generó esta tanda. La UI dice "actualizado hace X". */
  generatedAt: z.string(),
});
export type TrendsDto = z.infer<typeof trendsDtoSchema>;

export const TREND_SIGNAL_LABELS: Record<TrendSignal, string> = {
  rising: "Subiendo",
  stable: "Estable",
  new: "Nuevo",
};

export const TREND_FORMAT_LABELS: Record<TrendFormat, string> = {
  reel: "Reel",
  carrusel: "Carrusel",
  post: "Post",
  video: "Video",
  historia: "Historia",
};
