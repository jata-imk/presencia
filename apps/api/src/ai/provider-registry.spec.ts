import { describe, expect, it } from "vitest";
import { createModelResolver, type AiProviderConfig } from "./provider-registry.js";

const baseConfig: AiProviderConfig = {
  googleApiKey: "test-google-key",
  minimaxBaseUrl: "https://api.minimax.io/v1",
  defaultModelId: "google:gemini-3.5-flash",
};

describe("createModelResolver", () => {
  it("resuelve el modelo default cuando no se pasa id", () => {
    const resolve = createModelResolver(baseConfig);
    expect(resolve()).toMatchObject({ modelId: "gemini-3.5-flash" });
  });

  it("resuelve un id explícito por encima del default", () => {
    const resolve = createModelResolver({
      ...baseConfig,
      openaiApiKey: "test-openai-key",
    });
    expect(resolve("openai:gpt-5-mini")).toMatchObject({ modelId: "gpt-5-mini" });
  });

  it("registra minimax solo si hay API key", () => {
    const resolve = createModelResolver({
      ...baseConfig,
      minimaxApiKey: "test-minimax-key",
    });
    expect(resolve("minimax:MiniMax-M2")).toMatchObject({ modelId: "MiniMax-M2" });
  });

  it("truena con mensaje claro si el proveedor no tiene key configurada", () => {
    const resolve = createModelResolver(baseConfig);
    expect(() => resolve("openai:gpt-5-mini")).toThrow(/provider "openai" is not configured/);
  });

  it("truena si el id no tiene formato proveedor:modelo", () => {
    const resolve = createModelResolver(baseConfig);
    expect(() => resolve("gemini-3.5-flash")).toThrow(/is not configured/);
  });
});
