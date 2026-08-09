import type { UIMessage } from "ai";
import { summarizeCardContent, type CardToolOutput } from "@presencia/shared";

// F4.5: un chat con 5 cards arrastra 5 JSONs completos de publicación en
// cada request nuevo, porque `messages.parts` guarda el output de la tool
// tal cual y runAgentTurn recarga todo. Esta función se aplica SOLO entre
// toUIMessage y convertToModelMessages (chat.service.ts) — nunca en el
// camino que alimenta getMessages/la UI, que sigue necesitando el content
// completo para pintar las cards (PublicationCard.tsx lee part.output.content
// directo, no hay endpoint de cards que lo recupere después).

type ToolOutputPart = UIMessage["parts"][number] & {
  type: `tool-${string}`;
  state: "output-available";
  output: CardToolOutput;
};

// Duck-typing en vez de un type guard estricto: `output` es `unknown` en el
// tipo genérico de UIMessage, y las parts vienen del jsonb crudo de la DB.
// El guard de `content` cubre las parts legacy (pre F3 PR3) que no lo traen
// — esas se dejan intactas, igual que hace PublicationCard.tsx en la UI.
function asCardToolOutputPart(part: UIMessage["parts"][number]): ToolOutputPart | null {
  if (typeof part !== "object" || part === null) return null;
  const candidate = part as { type?: unknown; state?: unknown; output?: unknown };
  if (typeof candidate.type !== "string" || !candidate.type.startsWith("tool-")) return null;
  if (candidate.state !== "output-available") return null;
  const output = candidate.output as Partial<CardToolOutput> | undefined;
  if (!output || typeof output !== "object" || !("content" in output)) return null;
  return part as ToolOutputPart;
}

interface CompressedCardOutput {
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
