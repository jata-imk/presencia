import { z } from "zod";
import type { SocialNetwork } from "./publication.js";

// Contratos de Configuración > Canales conectados (F6, ADR-009 addendum).

export const socialAccountStatusSchema = z.enum(["active", "disconnected", "error"]);
export type SocialAccountStatus = z.infer<typeof socialAccountStatusSchema>;

export interface ChannelAccountDto {
  id: string;
  network: SocialNetwork;
  displayName: string | null;
  status: SocialAccountStatus;
}

export interface ConnectIntentDto {
  id: string;
  /** URL de postfa.st donde el usuario conecta la cuenta. */
  connectUrl: string;
  /** ISO 8601 — después de esto, claim() rechaza con "expiró". */
  expiresAt: string;
}

export const channelIntentIdParamSchema = z.object({ id: z.uuid() });
export const channelAccountIdParamSchema = z.object({ id: z.uuid() });
