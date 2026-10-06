import { describe, expect, it } from "vitest";
import { imageCallOptions } from "./image-models.js";

// Cómo se pide cada imagen según el generador (F10.7, ADR-025): proporción,
// tamaño y resolución 1K, cada proveedor a su manera.

describe("imageCallOptions", () => {
  it("OpenAI: tamaño fijo y calidad media; gpt-image-2 con la proporción exacta", () => {
    expect(imageCallOptions("openai", "gpt-image-1.5", "4:5")).toEqual({
      size: "1024x1536",
      providerOptions: { openai: { quality: "medium" } },
    });
    expect(imageCallOptions("openai", "gpt-image-2", "4:5").size).toBe("1024x1280");
  });

  it("Google: la proporción y 1K en imageConfig (el SDK los junta)", () => {
    expect(imageCallOptions("google", "gemini-3.1-flash-image", "4:5")).toEqual({
      aspectRatio: "4:5",
      providerOptions: { google: { imageConfig: { imageSize: "1K" } } },
    });
  });

  it("Grok y MAI no tienen 4:5: se pide 3:4 (más alta) y el recorte hace el resto", () => {
    expect(imageCallOptions("xai", "grok-imagine-image-2.0", "4:5")).toEqual({
      aspectRatio: "3:4",
      providerOptions: { xai: { resolution: "1k" } },
    });
    expect(imageCallOptions("openrouter", "microsoft/mai-image-2.6", "4:5")).toEqual({
      aspectRatio: "3:4",
      providerOptions: { openrouter: { resolution: "1K" } },
    });
    // Por familia: un alias o la versión siguiente heredan la regla.
    expect(imageCallOptions("xai", "grok-imagine-image", "4:5").aspectRatio).toBe("3:4");
    expect(imageCallOptions("openrouter", "microsoft/mai-image-2.7", "4:5").aspectRatio).toBe(
      "3:4",
    );
    // Las otras proporciones sí las tienen.
    expect(imageCallOptions("xai", "grok-imagine-image-2.0", "16:9").aspectRatio).toBe("16:9");
  });

  it("Muse recibe 4:5 tal cual: OpenRouter normaliza y lo que entregue lo recorta image-fit", () => {
    expect(imageCallOptions("openrouter", "meta/muse-image", "4:5").aspectRatio).toBe("4:5");
  });
});
