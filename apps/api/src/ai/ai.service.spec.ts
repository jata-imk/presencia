import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts valida process.env al import (fail-fast); AiService lee env.AI_MODEL
// en el constructor. Para probar el fallback de MODEL_BY_TASK por tier hace
// falta un process.env propio por escenario — vi.resetModules() + import()
// dinámico evita que el módulo cacheado de un test contamine el siguiente
// (mismo problema que resuelve rls.spec.ts con su import diferido).

const BASE_ENV = {
  APP_DATABASE_URL: "postgres://test/test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_URL: "http://localhost:5173",
  ZEPTOMAIL_TOKEN: "test-token",
  MAIL_FROM: "test@example.com",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
  ANTHROPIC_API_KEY: "anthropic-key",
};

const ORIGINAL_ENV = { ...process.env };

async function loadAiServiceWith(env: Record<string, string>) {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  const { AiService } = await import("./ai.service.js");
  return new AiService();
}

describe("AiService.resolveForTask", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("sin tiers seteados, toda tarea cae a AI_MODEL", async () => {
    const aiService = await loadAiServiceWith({
      ...BASE_ENV,
      AI_MODEL: "google:gemini-3.6-flash",
    });
    expect(aiService.resolveForTask("chat")).toMatchObject({
      provider: "google",
      modelName: "gemini-3.6-flash",
    });
    expect(aiService.resolveForTask("post_adapt")).toMatchObject({
      provider: "google",
      modelName: "gemini-3.6-flash",
    });
  });

  it("con AI_MODEL_CHAT seteado, solo la tarea chat lo usa", async () => {
    const aiService = await loadAiServiceWith({
      ...BASE_ENV,
      AI_MODEL: "google:gemini-3.6-flash",
      AI_MODEL_CHAT: "anthropic:claude-haiku-4-5",
    });
    expect(aiService.resolveForTask("chat")).toMatchObject({
      provider: "anthropic",
      modelName: "claude-haiku-4-5",
    });
    // chat_title vive en el tier utility, sin setear — cae a AI_MODEL.
    expect(aiService.resolveForTask("chat_title")).toMatchObject({
      provider: "google",
      modelName: "gemini-3.6-flash",
    });
  });

  it("AI_MODEL_UTILITY enruta a las 3 tareas de ese tier", async () => {
    const aiService = await loadAiServiceWith({
      ...BASE_ENV,
      AI_MODEL: "google:gemini-3.6-flash",
      AI_MODEL_UTILITY: "anthropic:claude-haiku-4-5",
    });
    for (const task of ["chat_title", "history_compaction", "analytics_narration"] as const) {
      expect(aiService.resolveForTask(task)).toMatchObject({
        provider: "anthropic",
        modelName: "claude-haiku-4-5",
      });
    }
  });

  it("boot truena si un tier apunta a un proveedor sin API key", async () => {
    await expect(
      loadAiServiceWith({
        ...BASE_ENV,
        AI_MODEL: "google:gemini-3.6-flash",
        AI_MODEL_ADAPT: "deepseek:deepseek-v4-flash",
      }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });
});
