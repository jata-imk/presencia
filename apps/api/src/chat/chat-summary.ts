import type { UIMessage } from "ai";
import type { ChatMessageMetadata, ChatSummary, MessageStatus } from "@presencia/shared";
import type { ChatRow, MessageRow } from "./chat.repository.js";

/**
 * La fila de `chats` como la ve el navegador. Una sola traducción para
 * `GET /api/chats` y para el evento `chat` del stream (F10.8), así las dos no
 * pueden desalinearse.
 */
export function toChatSummary(chat: ChatRow): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    folderId: chat.folderId,
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    pinnedAt: chat.pinnedAt?.toISOString() ?? null,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
  };
}

/**
 * Un mensaje guardado como lo usa el AI SDK. Desde F10.8.2 el id de fila es
 * el mismo que tiene la web (el del cliente para el creator, el del stream
 * para la respuesta). Una sola traducción para el turno del chat y para la
 * compactación (F10.8): las dos tienen que ver los mismos mensajes.
 */
export function toUIMessage(row: MessageRow): UIMessage {
  const message: UIMessage = {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as UIMessage["parts"],
  };
  // F10.8.2: solo si la respuesta no terminó completa (la card de estado).
  if (row.status !== "complete") {
    message.metadata = { status: row.status } satisfies ChatMessageMetadata;
  }
  return message;
}

/** El estado de una respuesta guardada (F10.8.2); `complete` si no trae. */
export function statusOf(message: UIMessage): MessageStatus {
  return (message.metadata as ChatMessageMetadata | undefined)?.status ?? "complete";
}
