import { isStaticToolUIPart, type FileUIPart, type ToolUIPart, type UIMessage } from "ai";
import {
  CARD_ARCHETYPE_TOOLS,
  type ChatMessageMetadata,
  MEMORY_TOOL_NAME,
  type CardArchetypeToolName,
  type CardToolOutput,
  type MemorySearchInput,
  type MemorySearchOutput,
  READ_LINK_TOOL_NAME,
  type ReadLinkInput,
  type ReadLinkOutput,
} from "@presencia/shared";

// Tipado explícito en vez de InferUITools: las tools del backend no
// declaran outputSchema Zod (el execute() retorna un objeto plano), así
// que InferUITools no podría inferir `content`. CardArchetypeToolName se
// deriva de CARD_ARCHETYPE_TOOLS en @presencia/shared, no se duplica aquí.
export type CardArchetypeUITools = {
  [K in CardArchetypeToolName]: { input: unknown; output: CardToolOutput };
};

/** F10.8: la memoria entre chats, una tool que no crea una card. */
export type MemoryUITools = {
  [MEMORY_TOOL_NAME]: { input: MemorySearchInput; output: MemorySearchOutput };
};

/** F10.10: leer un enlace. Su output es una referencia: el texto no llega aquí. */
export type WebUITools = {
  [READ_LINK_TOOL_NAME]: { input: ReadLinkInput; output: ReadLinkOutput };
};

// F10.8.2: `metadata.status` marca una respuesta que se cortó o falló.
export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  never,
  CardArchetypeUITools & MemoryUITools & WebUITools
>;
export type CardToolPart = ToolUIPart<CardArchetypeUITools>;
export type MemoryToolPart = ToolUIPart<MemoryUITools>;
export type WebToolPart = ToolUIPart<WebUITools>;

type ChatPart = ChatUIMessage["parts"][number];

// Lista explícita, como CARD_TOOL_TYPES en la API (context-diet.ts): "toda
// tool menos la de memoria" volvería a pintar como card rota la siguiente
// tool que no crea publicaciones.
const CARD_TOOL_TYPES: ReadonlySet<string> = new Set(
  CARD_ARCHETYPE_TOOLS.map((def) => `tool-${def.toolName}`),
);

/** El texto de un mensaje del creator, como se muestra, se reintenta y se edita. */
export function messageText(message: ChatUIMessage): string {
  return message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
}

/**
 * F10.9: los adjuntos de un mensaje del creator, tal cual se guardaron. Un
 * reintento o una edición los vuelven a mandar: sin ellos, el turno se
 * repetiría sin los archivos que la burbuja sigue mostrando.
 */
export function messageFiles(message: ChatUIMessage): FileUIPart[] {
  return message.parts.filter((part): part is FileUIPart => part.type === "file");
}

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

/** F10.10: una lectura de enlace (la búsqueda web se suma aquí en el PR5). */
export function isWebToolPart(part: ChatPart): part is WebToolPart {
  return part.type === `tool-${READ_LINK_TOOL_NAME}`;
}
