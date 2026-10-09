import type { UIMessage } from "ai";
import { CARD_ARCHETYPE_TOOLS, summarizeCardContent, type CardToolOutput } from "@presencia/shared";

// Discriminante explícito: solo las 3 tools de card (ADR-005), nunca "toda
// tool cuyo output tenga un campo content". F5-F7 ya tienen tareas futuras
// (post_adapt, voice_distill...) que podrían registrar tools nuevas — sin
// este filtro, una tool no-card con un output.content propio se reescribiría
// por error a {cardId: undefined, ...}.
const CARD_TOOL_TYPES = new Set(CARD_ARCHETYPE_TOOLS.map((def) => `tool-${def.toolName}`));

// F4.5: un chat con 5 cards arrastra 5 JSONs completos de publicación en
// cada request nuevo, porque `messages.parts` guarda el output de la tool
// tal cual y runAgentTurn recarga todo. Esta función se aplica SOLO entre
// toUIMessage y convertToModelMessages (chat.service.ts) — nunca en el
// camino que alimenta getMessages/la UI, que sigue necesitando el content
// completo para pintar las cards de mensajes viejos cuyo estado vivo todavía
// no llegó.

type ToolOutputPart = UIMessage["parts"][number] & {
  type: `tool-${string}`;
  state: "output-available";
  output: CardToolOutput;
};

// `output` es `unknown` en el tipo genérico de UIMessage, y las parts vienen
// del jsonb crudo de la DB — de ahí el cast al final, ya acotado por
// CARD_TOOL_TYPES. El guard de `content` cubre las parts legacy (pre F3 PR3)
// que no lo traen — esas se dejan intactas, igual que hace PublicationCard.tsx
// en la UI.
function asCardToolOutputPart(part: UIMessage["parts"][number]): ToolOutputPart | null {
  if (typeof part !== "object" || part === null) return null;
  const candidate = part as { type?: unknown; state?: unknown; output?: unknown };
  if (typeof candidate.type !== "string" || !CARD_TOOL_TYPES.has(candidate.type)) return null;
  if (candidate.state !== "output-available") return null;
  const output = candidate.output as Partial<CardToolOutput> | undefined;
  if (!output || typeof output !== "object" || !("content" in output)) return null;
  return part as ToolOutputPart;
}

export interface CompressedCardOutput {
  cardId: string;
  network: CardToolOutput["network"];
  status: CardToolOutput["status"];
  resumen: string;
}

/**
 * Sustituye el output de las tool calls de card más viejas que las últimas
 * `keepFull` por un resumen compacto — se deja la forma del objeto
 * ({cardId, network, status, resumen} en vez de {cardId, network, status,
 * content}) para no confundir al modelo sobre el schema de la tool. Las
 * últimas `keepFull` viajan íntegras por si el usuario dice "cámbiale el
 * hook a esa". Puro e inmutable: no muta `history`.
 */
export function compressToolOutputsForModel(history: UIMessage[], keepFull = 3): UIMessage[] {
  const totalToolOutputs = history.reduce(
    (count, message) =>
      count + message.parts.filter((part) => asCardToolOutputPart(part) !== null).length,
    0,
  );
  let toCompress = Math.max(totalToolOutputs - keepFull, 0);
  if (toCompress === 0) return history;

  return history.map((message) => {
    if (toCompress === 0) return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (toCompress === 0) return part;
      const toolOutputPart = asCardToolOutputPart(part);
      if (!toolOutputPart) return part;
      toCompress--;
      changed = true;
      const compressed: CompressedCardOutput = {
        cardId: toolOutputPart.output.cardId,
        network: toolOutputPart.output.network,
        status: toolOutputPart.output.status,
        resumen: summarizeCardContent(toolOutputPart.output.content),
      };
      return { ...toolOutputPart, output: compressed };
    });
    return changed ? { ...message, parts } : message;
  });
}

/**
 * F10.8: las cards de un tramo del historial, ya resumidas como las deja la
 * dieta. Es la lista que acompaña al resumen de la compactación: el LLM que
 * resume no las toca, así "cámbiale el hook a esa" sigue encontrando su id.
 * Una card que aparece dos veces (creada y luego modificada) queda una vez,
 * con su última aparición.
 */
export function cardSummariesIn(history: UIMessage[]): CompressedCardOutput[] {
  const byId = new Map<string, CompressedCardOutput>();
  for (const message of history) {
    for (const part of message.parts) {
      const toolOutputPart = asCardToolOutputPart(part);
      if (!toolOutputPart) continue;
      const { cardId, network, status, content } = toolOutputPart.output;
      byId.delete(cardId);
      byId.set(cardId, { cardId, network, status, resumen: summarizeCardContent(content) });
    }
  }
  return [...byId.values()];
}

/** Las cards que el historial menciona en outputs de tool, en orden. */
export function cardIdsIn(history: UIMessage[]): string[] {
  const ids: string[] = [];
  for (const message of history) {
    for (const part of message.parts) {
      const toolOutputPart = asCardToolOutputPart(part);
      if (toolOutputPart) ids.push(toolOutputPart.output.cardId);
    }
  }
  return ids;
}

/** Lo que la card es hoy, no lo que era al nacer. */
export interface LiveCard {
  content: CardToolOutput["content"];
  status: CardToolOutput["status"];
}

/**
 * F10.5: el output de la tool en `messages.parts` es la card al nacer,
 * congelada. Desde que la card se edita a mano, se restaura o la IA la
 * cambia, esa foto miente: si el usuario dice "hazme otra así", el modelo
 * partiría de un texto que ya no existe. Esto sustituye contenido y estado
 * por los vivos antes de mandarle el historial al modelo (y antes de
 * comprimir, para que el resumen también sea el vivo). Una card que ya no
 * existe (se borró) se deja como estaba. Puro e inmutable, como el resto.
 */
export function withLiveCards(
  history: UIMessage[],
  live: ReadonlyMap<string, LiveCard>,
): UIMessage[] {
  if (live.size === 0) return history;
  return history.map((message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      const toolOutputPart = asCardToolOutputPart(part);
      const current = toolOutputPart ? live.get(toolOutputPart.output.cardId) : undefined;
      if (!toolOutputPart || !current) return part;
      changed = true;
      return {
        ...toolOutputPart,
        output: { ...toolOutputPart.output, content: current.content, status: current.status },
      };
    });
    return changed ? { ...message, parts } : message;
  });
}
