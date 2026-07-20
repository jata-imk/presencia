import { describe, expect, it } from "vitest";
import { createModelResolver, parseModelId, type EnvSource } from "./provider-registry.js";

const baseEnv: EnvSource = {
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
};

describe("parseModelId", () => {
  it("acepta proveedor:modelo válido", () => {
    expect(parseModelId("google:gemini-3.5-flash")).toEqual({
      provider: "google",
      model: "gemini-3.5-flash",
    });
  });

  it("truena con proveedor desconocido listando los válidos", () => {
    expect(() => parseModelId("mistral:small")).toThrow(/one of: google, openai/);
  });

  it("truena con id sin prefijo de proveedor", () => {
    expect(() => parseModelId("gemini-3.5-flash")).toThrow(/provider:model/);
  });

  it("truena con modelo vacío después de los dos puntos", () => {
    expect(() => parseModelId("google:")).toThrow(/missing the model name/);
  });

  it("no acepta claves heredadas del prototipo como proveedor", () => {
    expect(() => parseModelId("constructor:x")).toThrow(/provider:model/);
    expect(() => parseModelId("toString:x")).toThrow(/provider:model/);
  });
});

describe("createModelResolver", () => {
  it("resuelve el modelo default cuando no se pasa id", () => {
    const resolve = createModelResolver(baseEnv, "google:gemini-3.5-flash");
    expect(resolve()).toMatchObject({ modelId: "gemini-3.5-flash" });
  });

  it("resuelve un id explícito por encima del default", () => {
    const resolve = createModelResolver(
      { ...baseEnv, OPENAI_API_KEY: "test-openai-key" },
      "google:gemini-3.5-flash",
    );
    expect(resolve("openai:gpt-5-mini")).toMatchObject({ modelId: "gpt-5-mini" });
  });

  it("registra anthropic, deepseek y kimi solo si hay API key", () => {
    const resolve = createModelResolver(
      {
        ...baseEnv,
        ANTHROPIC_API_KEY: "k",
        DEEPSEEK_API_KEY: "k",
        KIMI_API_KEY: "k",
        MINIMAX_API_KEY: "k",
      },
      "google:gemini-3.5-flash",
    );
    expect(resolve("anthropic:claude-haiku-4-5")).toMatchObject({ modelId: "claude-haiku-4-5" });
    expect(resolve("deepseek:deepseek-v4-flash")).toMatchObject({ modelId: "deepseek-v4-flash" });
    expect(resolve("kimi:kimi-latest")).toMatchObject({ modelId: "kimi-latest" });
    expect(resolve("minimax:MiniMax-M2")).toMatchObject({ modelId: "MiniMax-M2" });
  });

  it("google también es opcional: sin su key, truena igual que los demás", () => {
    const resolve = createModelResolver({ OPENAI_API_KEY: "k" }, "openai:gpt-5-mini");
    expect(resolve()).toMatchObject({ modelId: "gpt-5-mini" });
    expect(() => resolve("google:gemini-3.5-flash")).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
  });

  it("truena con mensaje claro si el proveedor no tiene key configurada", () => {
    const resolve = createModelResolver(baseEnv, "google:gemini-3.5-flash");
    expect(() => resolve("openai:gpt-5-mini")).toThrow(/no API key configured/);
  });
});
