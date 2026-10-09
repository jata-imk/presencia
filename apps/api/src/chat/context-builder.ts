import type { UIMessage } from "ai";
import {
  cardIdsIn,
  compressToolOutputsForModel,
  trimMemoryOutputsForModel,
  withLiveCards,
  type LiveCard,
} from "./context-diet.js";
import {
  applySummary,
  capHistory,
  pendingAfterSummary,
  type HistorySummary,
} from "./history-window.js";

// Lo que el modelo ve en cada turno (F10.8.1, ADR-026: "guardar ≠ recordar ≠
// mandar al modelo"). Puro: recibe el historial completo, el resumen y las
// cards como son hoy, y arma la ventana. La UI y lo que se persiste nunca
// pasan por aquí. El orden importa:
//
// 1. El resumen sustituye al tramo viejo (history-window.ts).
// 2. Las cards se describen como son HOY, no como quedaron en messages.parts.
// 3. Dieta: las cards viejas y los recuerdos de turnos pasados viajan cortos
//    (context-diet.ts).
// 4. El techo mecánico, medido sobre lo que de verdad viaja.

export interface ModelContext {
  messages: UIMessage[];
}

/**
 * Las cards cuyo estado vivo hace falta: las de la lista del resumen y las que
 * aparecen en la ventana. Juntas, para leerlas de una sola vez.
 */
export function cardIdsForContext(history: UIMessage[], summary: HistorySummary | null): string[] {
  // La ventana es lo que el resumen no cubre: mismo corte que applySummary.
  const window = pendingAfterSummary(history, summary);
  return [...new Set([...(summary?.cards.map((card) => card.cardId) ?? []), ...cardIdsIn(window)])];
}

/**
 * `live` es `null` si la lectura de las cards falló: la lista del resumen se
 * queda con su foto y las de la ventana con lo que guardó el mensaje. Peor
 * contexto, pero nunca un turno caído.
 */
export function assembleContext(
  history: UIMessage[],
  summary: HistorySummary | null,
  live: ReadonlyMap<string, LiveCard> | null,
  capTokens: number,
): ModelContext {
  const windowed = applySummary(history, summary, live);
  const messages = capHistory(
    trimMemoryOutputsForModel(
      compressToolOutputsForModel(withLiveCards(windowed, live ?? new Map())),
    ),
    capTokens,
  );
  return { messages };
}
