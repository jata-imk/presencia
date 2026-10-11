import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { sanitizeInterruptedParts } from "./interrupted-turn.js";

// Lo que se guarda de una respuesta cortada o fallida (F10.8.2): tiene que
// poder volver a viajar al modelo sin romper el request.

const parts = [
  { type: "step-start" },
  { type: "reasoning", text: "Pensando…", state: "streaming" },
  {
    type: "text",
    text: "Aquí va un borrador para",
    state: "streaming",
    providerMetadata: { openai: { itemId: "msg_123" } },
  },
  {
    type: "tool-crear_borrador_visual",
    toolCallId: "t-ok",
    state: "output-available",
    input: {},
    output: { cardId: "c-1" },
    callProviderMetadata: { openai: { itemId: "fc_1" } },
  },
  {
    type: "tool-crear_borrador_visual",
    toolCallId: "t-error",
    state: "output-error",
    input: {},
    errorText: "Input inválido",
  },
  { type: "tool-crear_borrador_visual", toolCallId: "t-a-medias", state: "input-streaming" },
  {
    type: "tool-buscar_en_memoria",
    toolCallId: "t-sin-resultado",
    state: "input-available",
    input: {},
  },
] as unknown as UIMessage["parts"];

describe("sanitizeInterruptedParts", () => {
  const saneadas = sanitizeInterruptedParts(parts);

  it("quita las tools que no terminaron: viajarían como tool-call sin resultado", () => {
    const ids = saneadas.flatMap((p) => ("toolCallId" in p ? [p.toolCallId] : []));
    expect(ids).toEqual(["t-ok", "t-error"]);
  });

  it("quita el razonamiento cortado", () => {
    expect(saneadas.some((p) => p.type === "reasoning")).toBe(false);
  });

  // Con store, OpenAI referenciaría un item que una respuesta cancelada puede no tener.
  it("quita la metadata del proveedor de los textos y las tools", () => {
    const json = JSON.parse(JSON.stringify(saneadas)) as Record<string, unknown>[];
    expect(json.some((p) => "providerMetadata" in p || "callProviderMetadata" in p)).toBe(false);
  });

  it("conserva el texto, marcado como terminado", () => {
    expect(saneadas.find((p) => p.type === "text")).toMatchObject({
      text: "Aquí va un borrador para",
      state: "done",
    });
  });
});
