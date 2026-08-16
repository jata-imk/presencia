import { z } from "zod";
import { socialNetworkSchema, type SocialNetwork } from "./publication.js";

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

// Solo-dev (PUBLISHING_PROVIDER=fake): simula "ya conecté mi cuenta en
// postfa.st" para poder probar el flujo completo de conexión sin la API
// real. 404 fuera de modo fake — ver ChannelsService.seedFakeAccount.
export const seedFakeAccountBodySchema = z.object({
  network: socialNetworkSchema,
  displayName: z.string().min(1).default("Cuenta de prueba"),
});
export type SeedFakeAccountBody = z.infer<typeof seedFakeAccountBodySchema>;
