import type { QuotaStatusDto } from "@presencia/shared";

// El transport del AI SDK hace `throw new Error(await response.text())`
// cuando el stream responde !ok (ver DefaultChatTransport): el rechazo de la
// API llega acá como el JSON crudo de su body, metido en error.message. Si no
// parsea, es un error normal (la red, el stream que se cortó).
function parseErrorBody(error: Error | undefined): Record<string, unknown> | null {
  if (!error) return null;
  try {
    const body: unknown = JSON.parse(error.message);
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// El 402 del gate de chat (chat.service.ts:assertQuotaForTurn) llega como
// `{code:"quota_exhausted", quota}`.
export function parseQuotaExhaustedError(error: Error | undefined): QuotaStatusDto | null {
  const body = parseErrorBody(error);
  if (body?.code === "quota_exhausted" && body.quota) {
    return body.quota as QuotaStatusDto;
  }
  return null;
}

/**
 * Rechazos del chat cuyo mensaje escribimos nosotros, en español (F10.8.2):
 * 400 "El mensaje no es válido.", 404 "Ese mensaje no se puede reintentar.",
 * 409 "Ese mensaje ya se envió.", 413 "Tu mensaje es demasiado largo…". Los
 * demás (401, 500) traen el texto de Nest en inglés: esos no se muestran.
 */
const OWN_MESSAGE_STATUSES = new Set([400, 404, 409, 413]);

/**
 * El mensaje en español de un rechazo de la API (la excepción de Nest llega
 * como `{statusCode, message}`), o null si no es uno de esos: ahí el chat pone
 * su propio texto. Un rechazo no guardó el mensaje, así que reintentarlo tal
 * cual daría lo mismo.
 */
export function parseApiErrorMessage(error: Error | undefined): string | null {
  const body = parseErrorBody(error);
  if (
    typeof body?.statusCode === "number" &&
    OWN_MESSAGE_STATUSES.has(body.statusCode) &&
    typeof body.message === "string"
  ) {
    return body.message;
  }
  return null;
}
