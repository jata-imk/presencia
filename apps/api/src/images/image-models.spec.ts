import { describe, expect, it, vi } from "vitest";
import { generatorStrength, imageCallOptions, imageGeneratorIds } from "./image-models.js";

describe("imageGeneratorIds", () => {
  it("la lista de AI_MODEL_IMAGE en orden; sin variable, el default", () => {
    expect(imageGeneratorIds("xai:grok-imagine-image-2.0,openai:gpt-image-2", undefined)).toEqual([
      "xai:grok-imagine-image-2.0",
      "openai:gpt-image-2",
    ]);
    expect(imageGeneratorIds(undefined, undefined)).toEqual(["google:gemini-3.1-flash-image"]);
  });

  it("el AI_MODEL_IMAGE_ALT viejo entra segundo (donde lo busca 'alternate'), con aviso y sin duplicarse", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(imageGeneratorIds("google:gemini-3.1-flash-image", "openai:gpt-image-2")).toEqual([
      "google:gemini-3.1-flash-image",
      "openai:gpt-image-2",
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("AI_MODEL_IMAGE_ALT está obsoleta"));
    warn.mockClear();
    expect(
      imageGeneratorIds("google:gemini-3.1-flash-image,openai:gpt-image-1.5", "openai:gpt-image-2"),
    ).toEqual(["google:gemini-3.1-flash-image", "openai:gpt-image-2", "openai:gpt-image-1.5"]);
    warn.mockClear();
    // Ya en la lista, pero más abajo: se mueve al segundo lugar.
    expect(
      imageGeneratorIds(
        "google:gemini-3.1-flash-image,openai:gpt-image-1.5,openai:gpt-image-2",
        "openai:gpt-image-2",
      ),
    ).toEqual(["google:gemini-3.1-flash-image", "openai:gpt-image-2", "openai:gpt-image-1.5"]);
    warn.mockClear();
    expect(
      imageGeneratorIds("google:gemini-3.1-flash-image,openai:gpt-image-2", "openai:gpt-image-2"),
    ).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

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

describe("generatorStrength", () => {
  it("el fuerte medido en el bake-off; un modelo sin medir no tiene", () => {
    expect(generatorStrength("google:gemini-3.1-flash-image")).toBe("Personas y realismo");
    expect(generatorStrength("openai:gpt-image-2")).toBe("Uso general");
    // Otro de la familia de OpenAI que no pasó por el bake-off no hereda el fuerte.
    expect(generatorStrength("openai:gpt-image-1.5")).toBeNull();
    // Ni un hermano o la versión siguiente: el fuerte se mide, no se hereda.
    expect(generatorStrength("openai:gpt-image-2-mini")).toBeNull();
    expect(generatorStrength("openai:gpt-image-2.5")).toBeNull();
    expect(generatorStrength("google:gemini-3.1-flash-lite-image")).toBeNull();
    // El snapshot fechado del mismo modelo sí lo conserva.
    expect(generatorStrength("openai:gpt-image-2-2026-04-21")).toBe("Uso general");
    expect(generatorStrength("openrouter:meta/muse-image")).toBeNull();
  });
});
