import { describe, expect, it } from "vitest";
import type { SocialNetwork } from "@presencia/shared";
import { networkOfCardPart, withoutCorrectedAttempts } from "./card-attempts.js";
import type { CardToolPart } from "./chat-types.js";

// Qué intentos fallidos se esconden (el modelo los corrigió en el turno). Puro.

const creada = (id: string, network: SocialNetwork): CardToolPart => ({
  type: "tool-crear_borrador_visual",
  toolCallId: id,
  state: "output-available",
  input: { network },
  output: {
    cardId: `card-${id}`,
    network,
    status: "draft",
    content: { archetype: "visual_first", caption: "c", hashtags: [], assetIds: [] },
  },
});

const fallida = (id: string, network: unknown): CardToolPart => ({
  type: "tool-crear_borrador_texto",
  toolCallId: id,
  state: "output-error",
  input: { network },
  errorText: "Algo salió mal generando la respuesta. Inténtalo de nuevo.",
});

const ids = (parts: CardToolPart[]) => parts.map((p) => p.toolCallId);

describe("withoutCorrectedAttempts", () => {
  it("el caso de prod: Facebook falla con la tool de texto y sale después con la visual", () => {
    const parts = [
      creada("li", "linkedin"),
      fallida("fb-mal", "facebook"),
      creada("fb", "facebook"),
    ];
    expect(ids(withoutCorrectedAttempts(parts))).toEqual(["li", "fb"]);
  });

  it("un fallo que nadie corrigió se queda: ahí sí falta la card", () => {
    const parts = [creada("li", "linkedin"), fallida("fb-mal", "facebook")];
    expect(ids(withoutCorrectedAttempts(parts))).toEqual(["li", "fb-mal"]);
  });

  it("solo lo corrige una card de la misma red, y que llegue después", () => {
    // Antes del fallo no cuenta: es otra card, no el reintento.
    const antes = [creada("fb", "facebook"), fallida("fb-mal", "facebook")];
    expect(ids(withoutCorrectedAttempts(antes))).toEqual(["fb", "fb-mal"]);
    // De otra red tampoco.
    const otraRed = [fallida("fb-mal", "facebook"), creada("ig", "instagram")];
    expect(ids(withoutCorrectedAttempts(otraRed))).toEqual(["fb-mal", "ig"]);
  });

  it("un fallo sin una red reconocible se queda", () => {
    const parts = [fallida("raro", "fb"), creada("fb", "facebook")];
    expect(ids(withoutCorrectedAttempts(parts))).toEqual(["raro", "fb"]);
  });

  it("cada card corrige un solo fallo: dos que fallaron y una que salió deja uno a la vista", () => {
    // "Tres variantes para Instagram": salió una, faltan dos. Esconder las dos
    // diría "Creé 1 borrador" sin avisar de las que no están.
    const parts = [fallida("a", "instagram"), fallida("b", "instagram"), creada("c", "instagram")];
    expect(ids(withoutCorrectedAttempts(parts))).toEqual(["a", "c"]);
  });

  it("mientras llega el turno, un reintento en camino ya cuenta: el error no parpadea", () => {
    const reintento: CardToolPart = {
      type: "tool-crear_borrador_visual",
      toolCallId: "fb",
      state: "input-available",
      input: { network: "facebook" },
    };
    const parts = [fallida("fb-mal", "facebook"), reintento];
    expect(ids(withoutCorrectedAttempts(parts, true))).toEqual(["fb"]);
    // Terminado el turno, un reintento que nunca llegó no corrige nada.
    expect(ids(withoutCorrectedAttempts(parts, false))).toEqual(["fb-mal", "fb"]);
  });
});

describe("networkOfCardPart", () => {
  it("la de la card creada, o la pedida si es válida", () => {
    expect(networkOfCardPart(creada("a", "x"))).toBe("x");
    expect(networkOfCardPart(fallida("b", "facebook"))).toBe("facebook");
    expect(networkOfCardPart(fallida("c", undefined))).toBeNull();
  });
});
