import { z } from "zod";
import { socialNetworkSchema } from "./publication.js";
import { macroRegionIdSchema, verticalIdSchema } from "./verticals.js";

// El contrato de las tendencias de Ritmo.
//
// Desde F9.6 son POR USUARIO. Nacieron como una caché compartida por
// `(vertical, país, región)` para que el gasto creciera con los nichos y no
// con los usuarios; la tarifa real de la búsqueda con grounding desarmó ese
// argumento —hay capa gratuita mensual, y después el costo por consulta es
// chico— y a cambio el cubo era demasiado grueso: "programación, IA, devops"
// caía en "tecnología", que es la industria entera. Ver ADR-024.
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

/**
 * Los idiomas en los que se buscan tendencias.
 *
 * El prompt pedía contenido en español de México y punto. En nichos técnicos
 * eso esconde justo lo que se mueve, que está en inglés — así que es una
 * perilla y no una constante. El default sigue siendo español: el producto es
 * para creators mexicanos.
 */
export const TREND_LANGS = ["es", "en"] as const;
export const trendLangSchema = z.enum(TREND_LANGS);
export type TrendLang = z.infer<typeof trendLangSchema>;

export const TREND_LANG_LABELS: Record<TrendLang, string> = {
  es: "Español",
  en: "Inglés",
};

/** Cuántas fuentes propias puede registrar un usuario. */
export const MAX_TREND_SOURCES = 10;

/**
 * Una fuente propia: un medio o sitio que el usuario quiere que miremos.
 *
 * Se guarda el HOST, no una URL completa, porque es lo que la búsqueda puede
 * acotar (`site:`) y lo que el usuario reconoce en la tarjeta. Pegar el
 * artículo entero y quedarse con su dominio es lo amable; guardar la ruta
 * sería acotar la búsqueda a una sola página.
 */
export const trendSourceSchema = z.object({
  id: z.string(),
  host: z.string(),
  createdAt: z.string(),
});
export type TrendSourceDto = z.infer<typeof trendSourceSchema>;

/**
 * El estado del botón de "actualizar ahora" (F9.6).
 *
 * El refresco periódico es del negocio; adelantarlo lo paga el usuario. Este
 * objeto es todo lo que la pantalla necesita para pintar el botón sin
 * calcular nada por su cuenta: si se puede pedir, si ya hay uno andando, y
 * cuánto cuesta.
 *
 * El costo viaja como **porcentaje de la cuota del mes** y no en unidades, por
 * la misma regla de siempre (addendum ADR-012): la web nunca ve la unidad
 * cruda del ledger, solo objeto contable. Un botón que dijera "800 unidades"
 * no le dice nada a nadie; "usa ~3% de tu mes", sí.
 */
export const trendRefreshStateSchema = z.object({
  /** `true` mientras hay un refresco pedido y sin terminar. */
  enCurso: z.boolean(),
  /**
   * Si se puede pedir uno ahora.
   *
   * `false` mientras hay otro en vuelo, y también cuando el usuario no tiene
   * saldo para el que le tocaría pagar.
   */
  disponible: z.boolean(),
  /**
   * Cuánto se llevaría de la cuota del mes, en porcentaje. **`0` significa
   * gratis**, y eso pasa cuando el usuario no tiene tendencias vigentes: no se
   * cobra por la primera entrega ni por rehacer una tanda que no trajo nada.
   */
  costoPorcentaje: z.number(),
});
export type TrendRefreshStateDto = z.infer<typeof trendRefreshStateSchema>;

export const trendsDtoSchema = z.object({
  vertical: verticalIdSchema,
  region: macroRegionIdSchema,
  items: z.array(trendItemSchema),
  /**
   * Cuándo se generó esta tanda, o `null` si todavía no se ha buscado nunca.
   *
   * El DTO viaja SIEMPRE, aunque no haya nada: devolver `null` pelón desde el
   * controller manda un cuerpo vacío que el cliente no puede parsear, y
   * además tirar la vertical y la región perdería lo único que hace honesto
   * al estado vacío — poder decir "no encontramos tendencias de Diseño en el
   * Sureste" en vez de un "no hay nada" sin sujeto.
   *
   * La vertical y la región siguen viajando aunque ya no sean llave de nada:
   * pasaron de decidir QUÉ caché se lee a ser contexto del prompt y sujeto del
   * estado vacío.
   */
  generatedAt: z.string().nullable(),
  /** Cuándo vence esta tanda. `null` si no hay ninguna. */
  expiresAt: z.string().nullable(),
  /** `true` si el usuario personalizó la búsqueda (fuentes, prompt o idiomas). */
  personalizada: z.boolean(),
  refresco: trendRefreshStateSchema,
});
export type TrendsDto = z.infer<typeof trendsDtoSchema>;

/**
 * Cómo normalizar lo que el usuario escribe como fuente.
 *
 * Acepta "canal10.tv", "https://canal10.tv/nota/123" o "www.canal10.tv" y
 * devuelve siempre el host sin `www.`. Devuelve `null` si no hay un host
 * reconocible — no se guarda basura que después haga que la búsqueda no
 * encuentre nada sin explicar por qué.
 */
export function normalizeTrendSource(entrada: string): string | null {
  const texto = entrada.trim().toLowerCase();
  if (!texto) return null;
  const conEsquema = /^https?:\/\//.test(texto) ? texto : `https://${texto}`;
  let host: string;
  try {
    host = new URL(conEsquema).hostname;
  } catch {
    return null;
  }
  const limpio = host.replace(/^www\./, "");
  // Un host de verdad tiene al menos un punto y nada raro alrededor.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(limpio)) return null;
  return limpio;
}

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
