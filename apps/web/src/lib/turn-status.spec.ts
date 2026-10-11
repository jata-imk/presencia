import { describe, expect, it } from "vitest";
import type { ChatUIMessage } from "./chat-types.js";
import { turnNotices, type LiveTurnState } from "./turn-status.js";

// Qué turnos llevan card de estado (F10.8.2). Puro.

const msg = (
  id: string,
  role: "user" | "assistant",
  text = `mensaje ${id}`,
  status?: "stopped" | "failed",
): ChatUIMessage => ({
  id,
  role,
  parts: text ? [{ type: "text", text }] : [],
  ...(status && { metadata: { status } }),
});

const QUIETO: LiveTurnState = { busy: false, local: new Map() };
const live = (entries: [string, "stopped" | "failed"][]): LiveTurnState => ({
  busy: false,
  local: new Map(entries),
});

describe("turnNotices", () => {
  it("un chat con todas sus respuestas completas no lleva cards", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant")];
    expect(turnNotices(chat, QUIETO).size).toBe(0);
  });

  it("al recargar, toma el estado que guardó el servidor", () => {
    const chat = [
      msg("u0", "user"),
      msg("a0", "assistant", "Aquí va", "stopped"),
      msg("u1", "user"),
      msg("a1", "assistant", "", "failed"),
    ];
    const notices = turnNotices(chat, QUIETO);
    expect(notices.get("u0")).toEqual({
      status: "stopped",
      partial: true,
      hasReply: true,
      actionable: false,
    });
    expect(notices.get("u1")).toEqual({
      status: "failed",
      partial: false,
      hasReply: true,
      actionable: true,
    });
  });

  // Turnos de antes de F10.8.2, o uno que nunca llegó al servidor.
  it("un mensaje del creator sin respuesta guardada se quedó sin respuesta", () => {
    const chat = [msg("u0", "user"), msg("u1", "user")];
    const notices = turnNotices(chat, QUIETO);
    expect(notices.get("u0")).toMatchObject({ status: "failed", actionable: false });
    expect(notices.get("u1")).toMatchObject({
      status: "failed",
      hasReply: false,
      actionable: true,
    });
  });

  it("mientras el turno llega, el último no tiene estado", () => {
    const chat = [msg("u0", "user")];
    expect(turnNotices(chat, { ...QUIETO, busy: true }).size).toBe(0);
  });

  it("en vivo: detener antes de la primera palabra", () => {
    const chat = [msg("u0", "user")];
    expect(turnNotices(chat, live([["u0", "stopped"]])).get("u0")).toEqual({
      status: "stopped",
      partial: false,
      hasReply: false,
      actionable: true,
    });
  });

  it("en vivo: detener a media respuesta conserva lo escrito", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant", "Aquí va un")];
    expect(turnNotices(chat, live([["u0", "stopped"]])).get("u0")).toMatchObject({
      status: "stopped",
      partial: true,
    });
  });

  // La respuesta en pantalla de un turno en vivo no trae metadata.
  it("en vivo: un turno detenido conserva su estado después de mandar otro", () => {
    const chat = [
      msg("u0", "user"),
      msg("a0", "assistant", "Aquí va un"),
      msg("u1", "user"),
      msg("a1", "assistant"),
    ];
    const notices = turnNotices(chat, live([["u0", "stopped"]]));
    expect(notices.get("u0")).toMatchObject({ status: "stopped", actionable: false });
    expect(notices.has("u1")).toBe(false);
  });
});
