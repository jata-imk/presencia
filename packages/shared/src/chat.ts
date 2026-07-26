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
  lastMessageAt: string | null;
  createdAt: string;
}

// Trigger del body de POST /chats/:id/stream — mismo contrato que
// DefaultChatTransport del AI SDK (ai/dist/index.d.ts, HttpChatTransport).
// `messages` del body se valida aparte con safeValidateUIMessages (AI SDK);
// este schema solo cubre los dos campos que el controller lee directamente
// para decidir el flujo (turno nuevo vs reintento).
export const chatStreamTriggerSchema = z.enum(["submit-message", "regenerate-message"]);
export type ChatStreamTrigger = z.infer<typeof chatStreamTriggerSchema>;

export const chatStreamBodySchema = z.object({
  trigger: chatStreamTriggerSchema.optional(),
  messageId: z.uuid().optional(),
});
export type ChatStreamBody = z.infer<typeof chatStreamBodySchema>;

export const renameChatBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export type RenameChatBody = z.infer<typeof renameChatBodySchema>;
