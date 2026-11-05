import type { TelegramLinkDto, TelegramLinkStatusDto } from "@presencia/shared";

// Qué pinta la tarjeta de Telegram en Configuración (F11 PR7a, Claude Design
// "Chat Telegram" §1), a partir del estado del servidor, el enlace que esta
// pestaña generó (si lo tiene) y la hora. Puro, para probarlo sin DOM.

export type TelegramCardView =
  | { kind: "hidden" }
  | { kind: "off" }
  /** `url` null: el enlace se generó antes de recargar (o en otra pestaña). */
  | { kind: "wait"; url: string | null; remainingMs: number }
  | { kind: "exp"; url: string | null }
  /** Ese Telegram ya está en otra cuenta; `url`, el mismo enlace, que sigue sirviendo. */
  | { kind: "err"; url: string | null }
  | { kind: "on"; username: string | null; linkedAt: string | null; botUsername: string | null };

export function telegramCardView(
  status: TelegramLinkStatusDto,
  link: TelegramLinkDto | null,
  nowMs: number,
): TelegramCardView {
  // El enlace de esta pestaña, solo si es el que el servidor tiene pendiente.
  const url = link && link.expiresAt === status.expiresAt ? link.url : null;
  const remainingMs = status.expiresAt ? Date.parse(status.expiresAt) - nowMs : 0;
  switch (status.state) {
    case "unavailable":
      return { kind: "hidden" };
    case "disconnected":
      return { kind: "off" };
    case "connected":
      return {
        kind: "on",
        username: status.username,
        linkedAt: status.linkedAt,
        botUsername: status.botUsername,
      };
    case "taken":
      return remainingMs > 0 ? { kind: "err", url } : { kind: "exp", url };
    case "expired":
      return { kind: "exp", url };
    case "waiting":
      // Venció entre una consulta y otra: no esperar al servidor para decirlo.
      return remainingMs > 0 ? { kind: "wait", url, remainingMs } : { kind: "exp", url };
  }
}
