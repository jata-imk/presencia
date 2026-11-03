import { createHash, randomBytes } from "node:crypto";

// El código de un solo uso del deep link (F11, ADR-030), sin dependencias: lo
// usan el servicio, los comandos y las pruebas.
//
// 32 bytes al azar en base64url: 43 caracteres de [A-Za-z0-9_-], dentro del
// límite de 64 que Telegram acepta en `start`. Se guarda su sha256, nunca el
// código en claro.

export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Un `start` que puede ser un código nuestro (el formato, no su validez). */
export function looksLikeLinkToken(payload: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(payload);
}
