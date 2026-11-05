import type { TelegramLinkStatusDto } from "@presencia/shared";
import { describe, expect, it } from "vitest";
import { telegramCardView } from "./telegram-card-view.js";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const EN_10MIN = "2026-11-04T12:10:00.000Z";
const LINK = { url: "https://t.me/presencia_bot?start=abc", expiresAt: EN_10MIN };

const status = (over: Partial<TelegramLinkStatusDto>): TelegramLinkStatusDto => ({
  state: "disconnected",
  username: null,
  linkedAt: null,
  expiresAt: null,
  botUsername: "presencia_bot",
  ...over,
});

describe("telegramCardView", () => {
  it("sin bot en el servidor, la sección no se pinta", () => {
    expect(telegramCardView(status({ state: "unavailable" }), null, NOW)).toEqual({
      kind: "hidden",
    });
  });

  it("esperando con el enlace de esta pestaña: lo da, con lo que falta", () => {
    expect(telegramCardView(status({ state: "waiting", expiresAt: EN_10MIN }), LINK, NOW)).toEqual({
      kind: "wait",
      url: LINK.url,
      remainingMs: 10 * 60_000,
    });
  });

  it("esperando tras recargar: sin enlace", () => {
    expect(telegramCardView(status({ state: "waiting", expiresAt: EN_10MIN }), null, NOW)).toEqual({
      kind: "wait",
      url: null,
      remainingMs: 10 * 60_000,
    });
  });

  it("un enlace que no es el pendiente (otra pestaña generó otro) no se usa", () => {
    const viejo = {
      url: "https://t.me/presencia_bot?start=viejo",
      expiresAt: "2026-11-04T12:05:00.000Z",
    };
    expect(
      telegramCardView(status({ state: "waiting", expiresAt: EN_10MIN }), viejo, NOW),
    ).toMatchObject({ kind: "wait", url: null });
  });

  it("si la cuenta llega a cero, vence sin esperar al servidor", () => {
    expect(
      telegramCardView(status({ state: "waiting", expiresAt: EN_10MIN }), LINK, NOW + 10 * 60_000),
    ).toEqual({ kind: "exp", url: LINK.url });
  });

  it("ya en otra cuenta, conectado y desconectado", () => {
    expect(telegramCardView(status({ state: "taken", expiresAt: EN_10MIN }), null, NOW)).toEqual({
      kind: "err",
    });
    expect(
      telegramCardView(
        status({ state: "connected", username: "jose", linkedAt: "2026-10-28T12:00:00.000Z" }),
        null,
        NOW,
      ),
    ).toEqual({
      kind: "on",
      username: "jose",
      linkedAt: "2026-10-28T12:00:00.000Z",
      botUsername: "presencia_bot",
    });
    expect(telegramCardView(status({}), null, NOW)).toEqual({ kind: "off" });
  });
});
