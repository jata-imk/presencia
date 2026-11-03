// Canal Telegram (F11, ADR-030): lo que la web necesita para conectar y
// desconectar la cuenta desde Configuración → Canales conectados.

/** Cuánto vive el código de un solo uso del deep link (`/start <código>`). */
export const TELEGRAM_LINK_TTL_MINUTES = 15;

/**
 * El estado del vínculo, como lo pinta Configuración:
 * - `unavailable`: el servidor no tiene bot configurado (sin token);
 * - `disconnected`: nunca se conectó, o se desconectó;
 * - `waiting`: hay un enlace generado que todavía no vence;
 * - `expired`: el último enlace venció sin usarse;
 * - `connected`: activo, con el @usuario de Telegram si lo tiene.
 */
export type TelegramLinkState =
  "unavailable" | "disconnected" | "waiting" | "expired" | "connected";

export interface TelegramLinkStatusDto {
  state: TelegramLinkState;
  /** @usuario de Telegram (sin la @), si lo tiene y está conectado. */
  username: string | null;
  /** ISO 8601: desde cuándo está conectado. */
  linkedAt: string | null;
  /** ISO 8601: cuándo vence el enlace pendiente (`waiting` o `expired`). */
  expiresAt: string | null;
}

/** Lo que devuelve generar un enlace: el deep link y cuándo vence. */
export interface TelegramLinkDto {
  /** `https://t.me/<bot>?start=<código>`: abre el bot con "Iniciar". */
  url: string;
  expiresAt: string;
}
