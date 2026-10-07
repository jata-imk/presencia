import type { ChatSummary } from "@presencia/shared";
import type { ChatRow } from "./chat.repository.js";

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
