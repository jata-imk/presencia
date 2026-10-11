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

/**
 * El mensaje en español de un rechazo de la API (la excepción de Nest llega
 * como `{statusCode, message}` en error.message, igual que el 402 de
 * arriba): "Tu mensaje es demasiado largo…", "Ese mensaje ya se envió.".
 * null si no es eso (un error a media respuesta, la red): ahí el chat pone
 * su propio texto.
 */
export function parseApiErrorMessage(error: Error | undefined): string | null {
  if (!error) return null;
  try {
    const body = JSON.parse(error.message) as { statusCode?: unknown; message?: unknown };
    if (typeof body.statusCode === "number" && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // No era JSON.
  }
  return null;
}
