import { describe, expect, it } from "vitest";
import { chargeUsageOf, CURRENT_RATE_CARD_VERSION, quoteChatTurn } from "./rate-card.js";

// El razonamiento se cobra dentro de la tarifa, no aparte (F10.7, ADR-012):
// desde v2 la salida que se cobra es la que el creator ve.

const turno = {
  inputTokens: 8000,
  outputTokens: 5000,
  cachedInputTokens: 0,
  reasoningTokens: 4000,
};

describe("quoteChatTurn", () => {
  it("v2 cobra la salida visible: el razonamiento no suma", () => {
    // 8k entrada × 8 + 1k salida visible × 24 = 88.
    expect(quoteChatTurn(turno, "chat", 2)).toBe(88);
  });

  it("v1 sigue cobrando la salida total, para no reinterpretar asientos viejos", () => {
    // 8k × 8 + 5k × 24 = 184.
    expect(quoteChatTurn(turno, "chat", 1)).toBe(184);
  });

  it("el mismo pedido cuesta lo mismo aunque un turno piense el doble", () => {
    const piensaPoco = { ...turno, outputTokens: 2000, reasoningTokens: 1000 };
    const piensaMucho = { ...turno, outputTokens: 3000, reasoningTokens: 2000 };
    expect(quoteChatTurn(piensaPoco, "chat", 2)).toBe(quoteChatTurn(piensaMucho, "chat", 2));
  });

  it("sin dato de razonamiento cobra la salida completa, y nunca menos de 1", () => {
    expect(quoteChatTurn({ ...turno, reasoningTokens: null }, "chat", 2)).toBe(184);
    expect(
      quoteChatTurn(
        { inputTokens: 0, outputTokens: 10, cachedInputTokens: 0, reasoningTokens: 10 },
        "chat",
        2,
      ),
    ).toBe(1);
  });

  it("la versión vigente es la que no cobra el razonamiento", () => {
    expect(CURRENT_RATE_CARD_VERSION).toBe(2);
  });
});

describe("chargeUsageOf", () => {
  it("toma del SDK la entrada, la caché, la salida y el razonamiento", () => {
    expect(
      chargeUsageOf({
        inputTokens: 100,
        inputTokenDetails: { noCacheTokens: 60, cacheReadTokens: 40, cacheWriteTokens: 0 },
        outputTokens: 50,
        outputTokenDetails: { textTokens: 20, reasoningTokens: 30 },
        totalTokens: 150,
      }),
    ).toEqual({ inputTokens: 100, outputTokens: 50, cachedInputTokens: 40, reasoningTokens: 30 });
  });
});
