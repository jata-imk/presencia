import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { assembleContext } from "./context-builder.js";
import { markUnansweredTurns } from "./unanswered-turns.js";

// Los turnos sin respuesta completa viajan marcados, no se quitan (F10.8.2).

const msg = (
  id: string,
  role: "user" | "assistant",
  text = `mensaje ${id}`,
  status?: "stopped" | "failed",
): UIMessage => ({
  id,
  role,
  parts: text ? [{ type: "text", text }] : [],
  ...(status && { metadata: { status } }),
});

const textOf = (message: UIMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ");

describe("markUnansweredTurns", () => {
  it("una respuesta completa pasa tal cual", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant"), msg("u1", "user")];
    expect(markUnansweredTurns(chat)).toEqual(chat);
  });

  it("una respuesta cortada conserva lo escrito y lleva la marca al final", () => {
    const chat = [
      msg("u0", "user"),
      msg("a0", "assistant", "Aquí va un borrador para", "stopped"),
      msg("u1", "user"),
    ];
    const marcada = markUnansweredTurns(chat)[1]!;
    expect(marcada.id).toBe("a0");
    expect(textOf(marcada)).toMatch(/^Aquí va un borrador para .*se detuvo aquí/);
  });

  it("una respuesta cortada antes de la primera palabra queda solo con la marca", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant", "", "stopped"), msg("u1", "user")];
    expect(textOf(markUnansweredTurns(chat)[1]!)).toMatch(/se detuvo aquí/);
  });

  it("una respuesta fallida lleva su propia marca", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant", "", "failed"), msg("u1", "user")];
    expect(textOf(markUnansweredTurns(chat)[1]!)).toMatch(/error técnico/);
  });

  // Turnos de antes de F10.8.2, o uno que cayó con el servidor: no hay fila.
  it("entre dos mensajes seguidos del creator mete una respuesta sintética", () => {
    const chat = [msg("u0", "user"), msg("u1", "user")];
    const marcado = markUnansweredTurns(chat);
    expect(marcado.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(marcado[1]!.id).toBe("presencia-sin-respuesta-u0");
    expect(textOf(marcado[1]!)).toMatch(/sin respuesta/);
  });

  it("nunca toca el último mensaje, que es el turno actual", () => {
    const chat = [msg("u0", "user"), msg("a0", "assistant"), msg("u1", "user")];
    expect(markUnansweredTurns(chat).at(-1)).toBe(chat[2]);
  });

  it("el context builder ya manda los turnos marcados", () => {
    const chat = [msg("u0", "user"), msg("u1", "user"), msg("a1", "assistant"), msg("u2", "user")];
    const context = assembleContext(chat, null, new Map(), 120_000);
    expect(context.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
    // La respuesta sintética no cuenta como "algo escondido" para la memoria.
    expect(context.oldestVisibleMessageId).toBeNull();
  });
});
