import type { QuotaStatusDto } from "@presencia/shared";

// El transport del AI SDK hace `throw new Error(await response.text())`
// cuando el stream responde !ok (ver DefaultChatTransport) — el 402 del
// gate de chat (chat.service.ts:assertQuotaForTurn) llega acá como el JSON
// crudo `{code:"quota_exhausted", quota}` metido en error.message. Si no
// parsea como ese shape, es un error normal (red, 500, etc.).
export function parseQuotaExhaustedError(error: Error | undefined): QuotaStatusDto | null {
  if (!error) return null;
  try {
    const body = JSON.parse(error.message) as { code?: unknown; quota?: unknown };
    if (body.code === "quota_exhausted" && body.quota) {
      return body.quota as QuotaStatusDto;
    }
  } catch {
    // No era JSON — error normal, no de cuota.
  }
  return null;
}
