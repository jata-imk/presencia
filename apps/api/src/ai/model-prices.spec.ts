import { describe, expect, it } from "vitest";
import { costOf } from "./model-prices.js";

describe("costOf", () => {
  it("una imagen 1K de Nano Banana 2 (1,120 tokens) cuesta lo que dice Google: $0.067", () => {
    const usd = costOf({
      provider: "google",
      model: "gemini-3.1-flash-image",
      inputTokens: 0,
      outputTokens: 1120,
      imagesCount: 1,
    });
    expect(usd).toBeCloseTo(0.0672, 4);
  });

  it("la entrada en caché se cobra a su tarifa, no a la completa", () => {
    const usd = costOf({
      provider: "google",
      model: "gemini-3.6-flash",
      inputTokens: 1_000_000,
      cachedInputTokens: 800_000,
      outputTokens: 0,
    });
    // 200k × $0.75/M + 800k × $0.075/M
    expect(usd).toBeCloseTo(0.15 + 0.06, 6);
  });

  it("las búsquedas y las imágenes de precio plano suman aparte", () => {
    expect(
      costOf({
        provider: "google",
        model: "gemini-3.6-flash",
        inputTokens: 0,
        outputTokens: 0,
        searchQueries: 3,
      }),
    ).toBeCloseTo(0.042, 6);
    expect(
      costOf({
        provider: "xai",
        model: "grok-imagine-image-2.0",
        inputTokens: 0,
        outputTokens: 0,
        imagesCount: 2,
      }),
    ).toBeCloseTo(0.08, 6);
  });

  it("un modelo sin fila en la tabla no tiene precio (null), no cero", () => {
    expect(
      costOf({ provider: "openai", model: "no-existe", inputTokens: 10, outputTokens: 10 }),
    ).toBeNull();
  });
});
