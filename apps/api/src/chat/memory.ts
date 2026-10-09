import type { UIMessage } from "ai";
import { EMBEDDING_DIMENSIONS } from "../ai/provider-registry.js";
import { transcriptForSummary } from "./history-compaction.js";

// Lo puro de la memoria entre chats (F10.8): qué se guarda de cada
// intercambio y cómo se le pide el embedding a cada proveedor. Aparte del
// servicio para probarlo sin levantar env ni base.

/** Cuánto de un intercambio se guarda e indexa. */
const MAX_CHUNK_CHARS = 4_000;

/** Cuántos recuerdos devuelve una búsqueda. */
export const MEMORY_RESULTS = 5;

/**
 * Debajo de esta similitud (coseno) un fragmento no es un recuerdo, es ruido:
 * la búsqueda siempre devuelve "los 5 más cercanos", aunque ninguno tenga que
 * ver. Calibrado con gemini-embedding-001 sobre los chats de dev (2026-10-08):
 * el mejor resultado de una búsqueda relacionada sacó 0.72–0.78, y las que no
 * tenían nada que ver ("receta de lasaña", "el dólar hoy") nunca pasaron de
 * 0.58. Cambiar de modelo obliga a recalibrar.
 */
export const MIN_SIMILARITY = 0.62;

/**
 * El texto de un intercambio: el mensaje del creator y la respuesta, como en
 * el transcript de la compactación (quién dijo qué, las publicaciones como una
 * línea y sin razonamiento ni JSON de tools).
 */
export function exchangeText(user: UIMessage | undefined, assistant: UIMessage): string {
  return transcriptForSummary(user ? [user, assistant] : [assistant]).slice(0, MAX_CHUNK_CHARS);
}

/**
 * El SDK no reporta los tokens de los embeddings de Google: se estiman con
 * ~4 caracteres por token, que alcanza para la telemetría de gasto.
 */
export function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Las opciones de cada proveedor para que los vectores midan lo mismo:
 * siempre EMBEDDING_DIMENSIONS, y en Google el tipo de tarea, que procesa
 * distinto un documento guardado y una búsqueda corta.
 */
export function embeddingOptions(
  provider: string,
  role: "document" | "query",
): Record<string, Record<string, string | number>> {
  if (provider === "google") {
    return {
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: role === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      },
    };
  }
  if (provider === "openai") return { openai: { dimensions: EMBEDDING_DIMENSIONS } };
  return {};
}
