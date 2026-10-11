import { z } from "zod";

// Contratos del módulo de chat (F1). La conversación canónica vive en
// la tabla messages; estos schemas cubren solo la superficie HTTP.

export const createChatBodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
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
});
export type ChatStreamBody = z.infer<typeof chatStreamBodySchema>;

/**
 * Cómo terminó una respuesta del asistente (F10.8.2). `stopped`: el stream se
 * cortó (Detener, cerrar la pestaña, la red); el servidor no distingue entre
 * esos. `failed`: el proveedor o el turno fallaron. Lo que alcanzó a
 * escribirse se guarda en los dos casos.
 */
export const MESSAGE_STATUSES = ["complete", "stopped", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * La metadata de un mensaje del chat como llega a la web (UIMessage.metadata).
 * `status` solo viene si la respuesta no terminó completa.
 */
export interface ChatMessageMetadata {
  status?: Exclude<MessageStatus, "complete">;
}

/**
 * Tope de un mensaje del creator, en caracteres (F10.8.2). Lo aplican el
 * composer (que no deja pasarlo) y el servidor (413 si llega más). ~12k
 * tokens: cabe un artículo pegado para resumir, no un libro. El límite del
 * body de `express.json` (main.ts) va holgado por encima de esto.
 */
export const MAX_MESSAGE_CHARS = 50_000;

export const renameChatBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export type RenameChatBody = z.infer<typeof renameChatBodySchema>;
