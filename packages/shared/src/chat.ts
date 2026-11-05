import { z } from "zod";

// Contratos del módulo de chat (F1). La conversación canónica vive en
// la tabla messages; estos schemas cubren solo la superficie HTTP.

/** El título más largo de un chat (también el que llega de un tema de Telegram, F11). */
export const CHAT_TITLE_MAX = 120;

export const createChatBodySchema = z.object({
  title: z.string().trim().min(1).max(CHAT_TITLE_MAX).optional(),
});

export type CreateChatBody = z.infer<typeof createChatBodySchema>;

export const chatIdParamSchema = z.object({
  id: z.uuid(),
});

export type ChatIdParam = z.infer<typeof chatIdParamSchema>;

export interface ChatSummary {
  id: string;
  title: string;
  folderId: string | null;
  /** ISO 8601, o null si no está archivado — F6 PR8. */
  archivedAt: string | null;
  /**
   * ISO 8601, o null si no está fijado (F6.5). Es timestamp y no boolean
   * para dar también el orden entre fijados. Nunca conviven con
   * `archivedAt`: archivar limpia el pin (CHECK en DB).
   */
  pinnedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  /**
   * F11: el id del último mensaje guardado. Solo lo trae el evento en vivo
   * (`event: chat` del stream, ADR-006): la pestaña con el chat abierto lo
   * compara con los suyos para saber si llegó algo por otro canal. `GET
   * /api/chats` no lo manda.
   */
  lastMessageId?: string | null;
}

// Trigger del body de POST /chats/:id/stream — mismo contrato que
// DefaultChatTransport del AI SDK (ai/dist/index.d.ts, HttpChatTransport).
// `messages` del body se valida aparte con safeValidateUIMessages (AI SDK);
// este schema solo cubre el campo que el controller lee directamente para
// decidir el flujo (turno nuevo vs reintento). NO hay un `messageId`
// separado — se probó que DefaultChatTransport nunca lo manda (bug real,
// 2026-08-19): el id del mensaje a reintentar es el id del último elemento
// de `messages`, ya validado aparte (mismo parseLastUserMessage que un
// turno normal).
export const chatStreamTriggerSchema = z.enum(["submit-message", "regenerate-message"]);
export type ChatStreamTrigger = z.infer<typeof chatStreamTriggerSchema>;

export const chatStreamBodySchema = z.object({
  trigger: chatStreamTriggerSchema.optional(),
  /**
   * F10.10: "Buscar en la web" del menú ＋. El mensaje obliga a buscar en el
   * primer paso; sin él, el modelo decide si busca.
   */
  webSearch: z.boolean().optional(),
});
export type ChatStreamBody = z.infer<typeof chatStreamBodySchema>;

/**
 * Cómo terminó una respuesta del asistente (F10.8.2). `stopped`: el stream se
 * cortó (Detener, cerrar la pestaña, la red); el servidor no distingue entre
 * esos. `failed`: el proveedor o el turno fallaron. Lo que alcanzó a
 * escribirse se guarda en los dos casos.
 */
/**
 * Por dónde entró o salió un mensaje (columna `messages.channel`, F11). La web
 * es el canal por defecto; los demás son adapters sobre la misma
 * conversación (regla dura #5).
 */
export const MESSAGE_CHANNELS = ["web", "telegram", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
/** Un canal que no es la web: el que la UI marca con ícono o etiqueta. */
export type ExternalChannel = Exclude<MessageChannel, "web">;

export const MESSAGE_STATUSES = ["complete", "stopped", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * La metadata de un mensaje del chat como llega a la web (UIMessage.metadata).
 * `status` solo viene si la respuesta no terminó completa; `voice`, si el
 * mensaje del creator llegó como nota de voz (F11) y su texto es la
 * transcripción.
 */
export interface ChatMessageMetadata {
  status?: Exclude<MessageStatus, "complete">;
  voice?: { seconds: number };
  /** Por dónde llegó el mensaje, si no fue la web (F11 PR7a): la etiqueta "Telegram" de la nota de voz. */
  channel?: ExternalChannel;
}

/**
 * Tope de un mensaje del creator, en caracteres (F10.8.2). Lo aplican el
 * composer (que no deja pasarlo) y el servidor (413 si llega más). ~12k
 * tokens: cabe un artículo pegado para resumir, no un libro. El límite del
 * body de `express.json` (main.ts) va holgado por encima de esto.
 */
export const MAX_MESSAGE_CHARS = 50_000;

export const renameChatBodySchema = z.object({
  title: z.string().trim().min(1).max(CHAT_TITLE_MAX),
});
export type RenameChatBody = z.infer<typeof renameChatBodySchema>;
