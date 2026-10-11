import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { lastMessageOnly } from "./chat-transport.js";

// El contrato con el servidor (F10.8.1): `parseLastUserMessage` solo lee el
// último mensaje y `chatStreamBodySchema` solo el `trigger`. Si esto cambia,
// un chat largo vuelve a dar 413 o un reintento a dar 400.

const msg = (id: string, role: "user" | "assistant"): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: id }],
});

describe("lastMessageOnly", () => {
  it("manda solo el último mensaje y el trigger, no el historial", () => {
    const historial = [msg("u0", "user"), msg("a0", "assistant"), msg("u1", "user")];
    const { body } = lastMessageOnly({
      body: undefined,
      messages: historial,
      trigger: "submit-message",
    });
    expect(body).toEqual({ trigger: "submit-message", messages: [historial[2]] });
  });

  it("al regenerar, el SDK ya quitó la respuesta vieja: el último es el del creator", () => {
    const recortado = [msg("u0", "user"), msg("a0", "assistant"), msg("u1", "user")];
    const { body } = lastMessageOnly({
      body: undefined,
      messages: recortado,
      trigger: "regenerate-message",
    });
    expect(body.messages).toEqual([recortado[2]]);
    expect(body.trigger).toBe("regenerate-message");
  });

  it("conserva el body extra de sendMessage, como el transport por default", () => {
    const { body } = lastMessageOnly({
      body: { cardId: "c-1" },
      messages: [msg("u0", "user")],
      trigger: "submit-message",
    });
    expect(body.cardId).toBe("c-1");
  });
});
