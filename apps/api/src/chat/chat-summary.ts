import type { UIMessage } from "ai";
import type { ChatSummary } from "@presencia/shared";
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
 * Un mensaje guardado como lo usa el AI SDK. El id de fila (uuid) sustituye al
 * id efímero del cliente. Una sola traducción para el turno del chat y para
 * la compactación (F10.8): las dos tienen que ver los mismos mensajes.
 */
export function toUIMessage(row: MessageRow): UIMessage {
  return {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as UIMessage["parts"],
  };
}
