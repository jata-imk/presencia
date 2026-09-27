import type { QuotaStatusDto } from "@presencia/shared";
import { ApiError } from "./api.js";

/**
 * El 402 del gate de cuota, si es lo que llegó. Mismo shape que el chat.
 *
 * No es un error de red: es una pantalla propia (QuotaExhaustedModal). Vive
 * aparte desde F9.7 porque ya lo usan Ritmo y el ejemplo de voz.
 */
export function cuotaAgotadaDe(error: unknown): QuotaStatusDto | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const body = error.body as { code?: unknown; quota?: unknown } | null;
  if (body?.code !== "quota_exhausted" || !body.quota) return null;
  return body.quota as QuotaStatusDto;
}
