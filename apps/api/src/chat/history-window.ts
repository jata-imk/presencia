import type { UIMessage } from "ai";
import { summarizeCardContent } from "@presencia/shared";
import type { CompressedCardOutput, LiveCard } from "./context-diet.js";

// Lo que el modelo ve de un chat largo (F10.8). Puro: nada de base ni de red.
//
// Dos mecanismos, en este orden:
// 1. **Compactación.** El tramo viejo ya resumido (`chat_summaries`) se
//    sustituye por el resumen, y lo posterior viaja completo. El resumen
//    reemplaza mensajes ENTEROS, nunca partes sueltas: OpenAI exige que cada
//    texto con razonamiento viaje con su reasoning item, y recortar un mensaje
//    a medias rompe el request con un 400 (ADR-006, addendum F4.5).
// 2. **Techo mecánico.** Si aun así el historial pasa del tope (el resumen
//    falló, o todavía no corrió), se mandan solo los mensajes más recientes
//    que quepan, con una nota. Sin LLM: es el seguro para que un chat de
//    cientos de turnos nunca tumbe el turno ni vacíe la cuota de golpe.
//
// La UI y lo que se persiste nunca pasan por aquí: siguen viendo todo.

/** Mensajes que se quedan completos, sin resumir, al compactar. */
export const KEEP_RECENT_MESSAGES = 10;

/** Prefijo de los mensajes que arma Presencia (no están en la base). */
const SYNTHETIC = "presencia-";

export interface HistorySummary {
  summary: string;
  /** El último mensaje que cubre el resumen; los posteriores viajan completos. */
  throughMessageId: string;
  cards: CompressedCardOutput[];
}

/**
 * Cuántos mensajes del principio de `pending` se compactan, dejando los
 * últimos `keep` completos. El corte se mueve hacia atrás hasta que el primer
 * mensaje conservado sea del creator: el tramo resumido termina en una
 * respuesta, y lo que queda empieza con una pregunta, sin partir un turno.
 */
export function compactionCut(pending: UIMessage[], keep = KEEP_RECENT_MESSAGES): number {
  let cut = Math.max(pending.length - keep, 0);
  while (cut > 0 && pending[cut]?.role !== "user") cut--;
  return cut;
}

function cardLine(card: CompressedCardOutput): string {
  return `- ${card.network} (${card.status}, id ${card.cardId}): ${card.resumen}`;
}

/** Un intercambio sintético: el contexto como mensaje del creator y un acuse. */
function syntheticPair(id: string, text: string): UIMessage[] {
  return [
    { id: `${SYNTHETIC}${id}-u`, role: "user", parts: [{ type: "text", text }] },
    {
      id: `${SYNTHETIC}${id}-a`,
      role: "assistant",
      parts: [{ type: "text", text: "Entendido, sigo con ese contexto." }],
    },
  ];
}

/**
 * El historial con el tramo compactado sustituido por su resumen. Va como un
 * intercambio (creator → acuse) y no como mensaje de sistema: los roles siguen
 * alternando, que algunos proveedores exigen, y el resto del prompt de sistema
 * no cambia de un turno a otro (su caché sigue sirviendo).
 *
 * Si el mensaje donde termina el resumen ya no está (no debería pasar: nunca se
 * borra un mensaje del tramo viejo), se devuelve el historial completo y el
 * techo mecánico hace su trabajo.
 *
 * `live` es lo que las cards de la lista son HOY: las del tramo resumido ya no
 * aparecen en ningún output de tool, así que withLiveCards no las alcanza. Una
 * card programada, editada o publicada después de compactar se describe como
 * es ahora, y una borrada sale de la lista. `null` si no se pudo leer: queda
 * la foto del resumen, peor contexto pero no un turno caído.
 */
export function applySummary(
  history: UIMessage[],
  summary: HistorySummary | null,
  live: ReadonlyMap<string, LiveCard> | null = null,
): UIMessage[] {
  if (!summary) return history;
  const through = history.findIndex((m) => m.id === summary.throughMessageId);
  if (through === -1) return history;
  const current = live
    ? summary.cards.flatMap((card) => {
        const now = live.get(card.cardId);
        return now
          ? [{ ...card, status: now.status, resumen: summarizeCardContent(now.content) }]
          : [];
      })
    : summary.cards;
  const cards =
    current.length > 0
      ? `\n\nPublicaciones que ya se crearon en esta conversación (usa su id si el creator se refiere a una):\n${current.map(cardLine).join("\n")}`
      : "";
  const text = `[Contexto: resumen de la parte anterior de esta conversación, que ya no ves completa.]\n\n${summary.summary}${cards}`;
  return [...syntheticPair("resumen", text), ...history.slice(through + 1)];
}

/** Mensajes posteriores al tramo que ya cubre el resumen (todos, si no hay). */
export function pendingAfterSummary(history: UIMessage[], summary: HistorySummary | null): number {
  if (!summary) return history.length;
  const through = history.findIndex((m) => m.id === summary.throughMessageId);
  return history.length - (through + 1);
}

/**
 * Tokens aproximados de lo que viaja: ~4 caracteres por token sobre el JSON de
 * las partes. No es exacto (no cuenta el prompt de sistema ni las tools), pero
 * sí estable y suficiente para un tope de seguridad. Del razonamiento solo se
 * cuenta el texto: su metadata (el contenido cifrado de OpenAI, varios KB por
 * mensaje) inflaría la cuenta y el techo recortaría historia de más.
 */
export function estimateTokens(messages: UIMessage[]): number {
  const chars = messages.reduce(
    (total, m) =>
      total +
      m.parts.reduce(
        (sum, part) =>
          sum + (part.type === "reasoning" ? part.text.length : JSON.stringify(part).length),
        0,
      ),
    0,
  );
  return Math.ceil(chars / 4);
}

/**
 * El techo mecánico. Bajo el tope, el historial pasa tal cual. Arriba, se
 * conservan los intercambios sintéticos del principio (el resumen) y, del
 * resto, los mensajes más recientes que quepan, empezando en un mensaje del
 * creator; adelante va una nota para que el modelo sepa que hubo más.
 */
export function capHistory(messages: UIMessage[], capTokens: number): UIMessage[] {
  if (estimateTokens(messages) <= capTokens) return messages;
  let pinned = 0;
  while (pinned < messages.length && messages[pinned]!.id.startsWith(SYNTHETIC)) pinned++;
  const head = messages.slice(0, pinned);
  const rest = messages.slice(pinned);
  let budget = capTokens - estimateTokens(head);
  let start = rest.length;
  while (start > 0) {
    const cost = estimateTokens([rest[start - 1]!]);
    if (cost > budget) break;
    budget -= cost;
    start--;
  }
  // Nunca vacío: el último mensaje (la pregunta de este turno) va siempre.
  start = Math.min(start, rest.length - 1);
  while (start < rest.length - 1 && rest[start]!.role !== "user") start++;
  const note = syntheticPair(
    "nota",
    "[Nota: esta conversación es muy larga y la parte más antigua ya no está disponible. Si el creator se refiere a algo de antes que no ves aquí, pídele que te lo recuerde.]",
  );
  return [...head, ...note, ...rest.slice(start)];
}
