import { isStaticToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import {
  CARD_ARCHETYPE_TOOLS,
  MEMORY_TOOL_NAME,
  type CardArchetypeToolName,
  type CardToolOutput,
  type MemorySearchInput,
  type MemorySearchOutput,
} from "@presencia/shared";

// Tipado explícito en vez de InferUITools: las tools del backend no
// declaran outputSchema Zod (el execute() retorna un objeto plano), así
// que InferUITools no podría inferir `content`. CardArchetypeToolName se
// deriva de CARD_ARCHETYPE_TOOLS en @presencia/shared, no se duplica aquí.
export type CardArchetypeUITools = {
  [K in CardArchetypeToolName]: { input: unknown; output: CardToolOutput };
};

/** F10.8: la memoria entre chats, la única tool que no crea una card. */
export type MemoryUITools = {
  [MEMORY_TOOL_NAME]: { input: MemorySearchInput; output: MemorySearchOutput };
};

export type ChatUIMessage = UIMessage<never, never, CardArchetypeUITools & MemoryUITools>;
export type CardToolPart = ToolUIPart<CardArchetypeUITools>;
export type MemoryToolPart = ToolUIPart<MemoryUITools>;

type ChatPart = ChatUIMessage["parts"][number];

// Lista explícita, como CARD_TOOL_TYPES en la API (context-diet.ts): "toda
// tool menos la de memoria" volvería a pintar como card rota la siguiente
// tool que no crea publicaciones.
const CARD_TOOL_TYPES: ReadonlySet<string> = new Set(
  CARD_ARCHETYPE_TOOLS.map((def) => `tool-${def.toolName}`),
);

/**
 * Una tool que creó (o está creando) una card de publicación. Desde F10.8 no
 * toda tool es una card: la de memoria solo busca, y pintarla como card
 * dejaría una tarjeta rota en el chat.
 */
export function isCardToolPart(part: ChatPart): part is CardToolPart {
  return isStaticToolUIPart(part) && CARD_TOOL_TYPES.has(part.type);
}

export function isMemoryToolPart(part: ChatPart): part is MemoryToolPart {
  return part.type === `tool-${MEMORY_TOOL_NAME}`;
}
