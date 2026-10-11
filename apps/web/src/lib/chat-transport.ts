import { DefaultChatTransport, type UIMessage } from "ai";

/**
 * El body de cada request al stream del chat: solo el último mensaje y el
 * `trigger`. El servidor reconstruye el historial desde la base (fuente de
 * verdad única) y nunca leyó el resto; mandarlo entero hacía crecer cada
 * request con el chat, y uno largo (cards, razonamiento) pasaba el límite de
 * 100 kB de express.json() con un 413.
 *
 * Precondición, la misma que `parseLastUserMessage` en el servidor: el último
 * mensaje es el del creator. Así es para un turno nuevo y para regenerar (el
 * SDK quita la respuesta vieja antes de mandar). Si algún día se mandan
 * turnos automáticos (`sendAutomaticallyWhen`, resultados de tools del
 * cliente), el último sería del asistente y esto tiene que cambiar.
 *
 * Conserva el `body` extra que alguien pase en `sendMessage(…, { body })`,
 * como haría el transport por default.
 */
export function lastMessageOnly({
  body,
  messages,
  trigger,
}: {
  body: Record<string, unknown> | undefined;
  messages: UIMessage[];
  trigger: "submit-message" | "regenerate-message";
}): { body: Record<string, unknown> } {
  return { body: { ...body, trigger, messages: messages.slice(-1) } };
}

export function chatTransport(chatId: string): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport({
    api: `/api/chats/${chatId}/stream`,
    prepareSendMessagesRequest: lastMessageOnly,
  });
}
