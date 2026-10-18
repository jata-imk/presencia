import { apiFetch } from "./api.js";
import type { ChatUIMessage } from "./chat-types.js";

/**
 * La conversación como la guardó el servidor. La carga del chat la usa al
 * entrar, y desde F10.9 también el regenerar o editar que la API rechaza: el
 * SDK ya había cambiado la lista en pantalla antes de mandar, y el servidor
 * conservó la original.
 */
export function fetchChatMessages(chatId: string): Promise<ChatUIMessage[]> {
  return apiFetch<ChatUIMessage[]>(`/api/chats/${chatId}/messages`);
}
