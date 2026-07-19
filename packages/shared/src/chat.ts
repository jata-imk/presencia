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
