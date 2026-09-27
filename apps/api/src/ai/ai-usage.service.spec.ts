import { describe, expect, it, vi } from "vitest";
import type { LanguageModelUsage } from "ai";
import type { DbService } from "../db/db.service.js";
import type { AiUsageRepository } from "./ai-usage.repository.js";

// Sin Postgres: lo que se prueba acá es el contrato de `registrar` —que arma
// la fila desde el usage del SDK y que NUNCA lanza—, no la escritura. La fila
// real contra la base la cubre trends/telemetria.spec.ts.

const USAGE = {
  inputTokens: 100,
  outputTokens: 40,
  totalTokens: 140,
  inputTokenDetails: { noCacheTokens: 70, cacheReadTokens: 30, cacheWriteTokens: undefined },
  outputTokenDetails: { textTokens: 40, reasoningTokens: undefined },
} as LanguageModelUsage;

async function servicio(runWithTenant: DbService["runWithTenant"], insertEvent = vi.fn()) {
  // Import dinámico: el servicio arrastra DbService, y env.ts valida el
  // entorno al importarse.
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  const { AiUsageService } = await import("./ai-usage.service.js");
  const db = { runWithTenant } as unknown as DbService;
  const repo = { insertEvent } as unknown as AiUsageRepository;
  return new AiUsageService(db, repo);
}

describe("AiUsageService.registrar", () => {
  it("arma la fila desde el usage del SDK", async () => {
    const insertEvent = vi.fn();
    const aiUsage = await servicio((_userId, fn) => fn({} as never), insertEvent);

    await aiUsage.registrar({
      userId: "u1",
      task: "trends_search",
      modelo: { provider: "google", modelName: "gemini" },
      usage: USAGE,
      stepsCount: 2,
      arranque: Date.now(),
      searchQueries: 4,
      providerRaw: { crudo: true },
    });

    expect(insertEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: "u1",
        chatId: null,
        taskKind: "trends_search",
        provider: "google",
        model: "gemini",
        inputTokens: 100,
        outputTokens: 40,
        cachedInputTokens: 30,
        stepsCount: 2,
        searchQueries: 4,
        providerRaw: { crudo: true },
      }),
    );
  });

  it("sin searchQueries escribe null: la llamada no busca", async () => {
    const insertEvent = vi.fn();
    const aiUsage = await servicio((_userId, fn) => fn({} as never), insertEvent);
    await aiUsage.registrar({
      userId: "u1",
      task: "chat",
      modelo: { provider: "google", modelName: "gemini" },
      usage: USAGE,
      stepsCount: 1,
      arranque: Date.now(),
      providerRaw: {},
    });
    expect(insertEvent.mock.calls[0]?.[1]).toMatchObject({ searchQueries: null, chatId: null });
  });

  it("una imagen registra cuántas produjo, con el usage corto de un modelo de imagen", async () => {
    const insertEvent = vi.fn();
    const aiUsage = await servicio((_userId, fn) => fn({} as never), insertEvent);
    await aiUsage.registrar({
      userId: "u1",
      task: "image_generate",
      modelo: { provider: "google", modelName: "gemini-3.1-flash-image" },
      usage: { inputTokens: 12, outputTokens: 1290, totalTokens: 1302 },
      stepsCount: 1,
      arranque: Date.now(),
      imagesCount: 1,
      providerRaw: {},
    });
    expect(insertEvent.mock.calls[0]?.[1]).toMatchObject({
      taskKind: "image_generate",
      inputTokens: 12,
      outputTokens: 1290,
      cachedInputTokens: null,
      imagesCount: 1,
      searchQueries: null,
    });
  });

  it("sin imagesCount escribe null: la llamada no dibuja", async () => {
    const insertEvent = vi.fn();
    const aiUsage = await servicio((_userId, fn) => fn({} as never), insertEvent);
    await aiUsage.registrar({
      userId: "u1",
      task: "chat",
      modelo: { provider: "google", modelName: "gemini" },
      usage: USAGE,
      stepsCount: 1,
      arranque: Date.now(),
      providerRaw: {},
    });
    expect(insertEvent.mock.calls[0]?.[1]).toMatchObject({ imagesCount: null });
  });

  it("un fallo al escribir no se propaga", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const aiUsage = await servicio(() => Promise.reject(new Error("se cayó la base")));

    await expect(
      aiUsage.registrar({
        userId: "u1",
        task: "chat",
        modelo: { provider: "google", modelName: "gemini" },
        usage: USAGE,
        stepsCount: 1,
        arranque: Date.now(),
        providerRaw: {},
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
