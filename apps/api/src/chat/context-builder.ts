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
  isSyntheticMessage,
  pendingAfterSummary,
  type HistorySummary,
} from "./history-window.js";
import { markUnansweredTurns } from "./unanswered-turns.js";
import {
  attachmentIdsIn,
  dietAttachments,
  type AttachmentForContext,
} from "./attachment-context.js";
import { dietWebReads, webReadIdsIn, type WebReadForContext } from "./web-read-context.js";

// Lo que el modelo ve en cada turno (F10.8.1, ADR-026: "guardar ≠ recordar ≠
// mandar al modelo"). Puro: recibe el historial completo, el resumen y las
// cards como son hoy, y arma la ventana. La UI y lo que se persiste nunca
// pasan por aquí. El orden importa:
//
// 1. El resumen sustituye al tramo viejo (history-window.ts), y los turnos que
//    se quedaron sin respuesta completa van marcados (unanswered-turns.ts).
// 2. Las cards se describen como son HOY, no como quedaron en messages.parts.
// 3. Dieta: los adjuntos viejos viajan como su descripción (F10.9,
//    attachment-context.ts), las páginas leídas fuera de la ventana como una
//    línea (F10.10, web-read-context.ts), y las cards viejas y los recuerdos
//    de turnos pasados, cortos (context-diet.ts).
// 4. El techo mecánico, medido sobre lo que de verdad viaja. Los bytes de los
//    adjuntos que sobreviven se cargan después (AttachmentsService.materialize).

export interface ModelContext {
  messages: UIMessage[];
  /**
   * El mensaje real más viejo que el modelo ve completo (el primero que no es
   * el resumen ni la nota del techo). Lo anterior solo lo ve resumido: la
   * memoria (F10.8.1) busca ahí también. `null` si ve el chat completo (sin
   * resumen ni techo): no hay nada escondido que buscar en este chat.
   */
  oldestVisibleMessageId: string | null;
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
 * F10.9: los adjuntos cuyas filas hacen falta: los que cita la ventana (lo
 * resumido ya no los nombra).
 */
export function attachmentIdsForContext(
  history: UIMessage[],
  summary: HistorySummary | null,
): string[] {
  return attachmentIdsIn(pendingAfterSummary(history, summary));
}

/** F10.10: las páginas leídas cuyas filas hacen falta, igual que los adjuntos. */
export function webReadIdsForContext(
  history: UIMessage[],
  summary: HistorySummary | null,
): string[] {
  return webReadIdsIn(pendingAfterSummary(history, summary));
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
  /** F10.9: las filas de los adjuntos citados; `null` si la lectura falló. */
  attachments: ReadonlyMap<string, AttachmentForContext> | null = new Map(),
  /** F10.10: las filas de las páginas leídas; `null` si la lectura falló. */
  webReads: ReadonlyMap<string, WebReadForContext> | null = new Map(),
): ModelContext {
  // Después del resumen: un turno sin respuesta que ya quedó resumido no se
  // marca, y la marca no puede quedar pegada al acuse sintético del resumen.
  const windowed = markUnansweredTurns(applySummary(history, summary, live));
  const messages = capHistory(
    trimMemoryOutputsForModel(
      compressToolOutputsForModel(
        dietWebReads(
          dietAttachments(withLiveCards(windowed, live ?? new Map()), attachments),
          webReads,
        ),
      ),
    ),
    capTokens,
  );
  return {
    messages,
    oldestVisibleMessageId:
      messages[0] && isSyntheticMessage(messages[0])
        ? (messages.find((m) => !isSyntheticMessage(m))?.id ?? null)
        : null,
  };
}
