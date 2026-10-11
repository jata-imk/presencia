import { describe, expect, it } from "vitest";
import { parseApiErrorMessage } from "./chat-error.js";

// El transport del AI SDK mete el body crudo del rechazo en error.message.
describe("parseApiErrorMessage", () => {
  it("devuelve el mensaje en español de una excepción de Nest", () => {
    const error = new Error(
      JSON.stringify({
        statusCode: 413,
        error: "Payload Too Large",
        message: "Tu mensaje es demasiado largo.",
      }),
    );
    expect(parseApiErrorMessage(error)).toBe("Tu mensaje es demasiado largo.");
  });

  it("null para un error que no viene de la API", () => {
    expect(parseApiErrorMessage(new Error("Failed to fetch"))).toBeNull();
    expect(parseApiErrorMessage(undefined)).toBeNull();
  });
});
