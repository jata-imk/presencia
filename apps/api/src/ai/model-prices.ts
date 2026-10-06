// Cuánto cuesta cada modelo que usamos, en dólares. Fuente única: el reporte
// de gasto (`pnpm --filter @presencia/api gasto`) lo lee para convertir
// `ai_usage_events` (tokens, imágenes, búsquedas) en dinero. Antes los precios
// vivían sueltos en los ADR y sumar el gasto era cuenta a mano.
//
// NO es el cobro al creator: eso es el rate card en unidades (ADR-012), que a
// propósito no tiene precio en dólares. Esto es lo que NOS cuesta a nosotros.
//
// Cómo mantenerla:
// - Un modelo que no está aquí sale "sin precio" en el reporte (con sus
//   tokens), no con un precio inventado. Agregar la fila es lo que lo arregla.
// - Cada fila dice de dónde salió y cuándo se revisó: los precios cambian (el
//   de Gemini 3.6 Flash sube el 2027-01-01).
// - Los niveles gratis (las 5,000 búsquedas al mes de Gemini) no se restan:
//   el reporte es el techo, no la factura.

export interface ModelPrice {
  /** Dólares por millón de tokens de entrada (sin caché). */
  inputPerM: number;
  /** Dólares por millón de tokens de entrada servidos desde caché. */
  cachedInputPerM?: number;
  /** Dólares por millón de tokens de salida (en los de imagen, la imagen misma). */
  outputPerM: number;
  /** Dólares por imagen, para los que cobran plano y no por token. */
  perImage?: number;
  /** Dólares por búsqueda (grounding, web search). */
  perSearch?: number;
  /** De dónde salió el precio y cuándo se revisó. */
  source: string;
}

/** Por `proveedor:modelo`, el mismo id que `provider-registry` y `ai_usage_events`. */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "google:gemini-3.6-flash": {
    inputPerM: 0.75,
    cachedInputPerM: 0.075,
    outputPerM: 3.75,
    perSearch: 14 / 1000,
    source: "ai.google.dev/gemini-api/docs/pricing, 2026-09-30 (hasta 2026-12-31; luego 1.50/7.50)",
  },
  "google:gemini-3.8-flash": {
    inputPerM: 0.75,
    cachedInputPerM: 0.075,
    outputPerM: 3.75,
    perSearch: 14 / 1000,
    source: "ai.google.dev/gemini-api/docs/pricing, 2026-10-06 (hasta 2026-12-31; luego 1.50/7.50)",
  },
  "openai:gpt-6-luna": {
    inputPerM: 0.1,
    cachedInputPerM: 0.01,
    outputPerM: 0.5,
    source: "developers.openai.com/api/docs/models/gpt-6-luna, 2026-10-06",
  },
  "anthropic:claude-sonnet-5-5": {
    inputPerM: 2,
    cachedInputPerM: 0.2,
    outputPerM: 10,
    source: "platform.claude.com/docs/en/about-claude/pricing, 2026-10-06",
  },
  "google:gemini-3.1-flash-image": {
    inputPerM: 0.5,
    // ~1,120 tokens por imagen 1K = $0.067.
    outputPerM: 60,
    source: "ai.google.dev/gemini-api/docs/pricing, 2026-09-30",
  },
  "google:gemini-3.1-flash-lite-image": {
    inputPerM: 0.25,
    outputPerM: 30,
    source: "ai.google.dev/gemini-api/docs/pricing, 2026-09-30 ($0.0336 por imagen 1K)",
  },
  "openai:gpt-5.6-terra": {
    inputPerM: 2,
    cachedInputPerM: 0.2,
    outputPerM: 12,
    perSearch: 10 / 1000,
    source: "openrouter.ai/openai/gpt-5.6-terra, 2026-09-30",
  },
  "openai:gpt-image-2": {
    // La entrada mezcla texto ($5/M) e imagen de referencia ($8/M); se cobra
    // como texto, que es casi toda la entrada al generar.
    inputPerM: 5,
    outputPerM: 30,
    source: "developers.openai.com/api/docs/pricing, 2026-09-30",
  },
  "xai:grok-imagine-image-2.0": {
    inputPerM: 0,
    outputPerM: 0,
    perImage: 0.04,
    source: "docs.x.ai/developers/pricing, 2026-09-30",
  },
  "openrouter:meta/muse-image": {
    inputPerM: 0,
    outputPerM: 0,
    perImage: 0.01,
    source:
      "openrouter.ai/meta/muse-image y dev.meta.ai, 2026-10-06 (plano por imagen; OpenRouter reporta el costo real en provider_raw)",
  },
  "openrouter:microsoft/mai-image-2.6": {
    // Por tokens: $5/M de texto y $38/M de salida; ~$0.039 una imagen 1K. La
    // imagen de partida de una edición es $8/M y aquí se cuenta como texto:
    // el reporte subestima las ediciones. El costo exacto de cada llamada
    // queda en provider_raw.providerMetadata.openrouter.cost. No toca el cobro
    // al creator, que es tarifa fija por imagen (ADR-012).
    inputPerM: 5,
    outputPerM: 38,
    source: "openrouter.ai/microsoft/mai-image-2.6, 2026-10-06",
  },
  "fake:solid-png": { inputPerM: 0, outputPerM: 0, source: "generador de mentira de dev" },
};

export interface UsageForCost {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number | null;
  imagesCount?: number | null;
  searchQueries?: number | null;
}

/** Dólares de un uso, o null si el modelo no tiene precio en la tabla. */
export function costOf(usage: UsageForCost): number | null {
  const price = MODEL_PRICES[`${usage.provider}:${usage.model}`];
  if (!price) return null;
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  return (
    (fresh * price.inputPerM) / 1e6 +
    (cached * (price.cachedInputPerM ?? price.inputPerM)) / 1e6 +
    (usage.outputTokens * price.outputPerM) / 1e6 +
    (usage.imagesCount ?? 0) * (price.perImage ?? 0) +
    (usage.searchQueries ?? 0) * (price.perSearch ?? 0)
  );
}
