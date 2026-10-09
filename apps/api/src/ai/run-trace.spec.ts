import { describe, expect, it } from "vitest";
import { RunTrace, errorText } from "./run-trace.js";

const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);

function paso(stepNumber: number, extra: Partial<{ finishReason: string; cached: number }> = {}) {
  return {
    stepNumber,
    model: { provider: "openai.responses", modelId: "gpt-6-luna" },
    usage: {
      inputTokens: 1_000,
      outputTokens: 50,
      inputTokenDetails: { cacheReadTokens: extra.cached ?? 800 },
    },
    performance: { responseTimeMs: 900 },
    finishReason: extra.finishReason ?? "tool-calls",
  };
}

describe("RunTrace", () => {
  it("un renglón por paso de modelo y por tool, con el id que usa el .env", () => {
    const trace = new RunTrace("run-1");
    trace.stepStarted({ stepNumber: 0, provider: "openai.responses", modelId: "gpt-6-luna" }, T0);
    trace.toolFinished(
      {
        toolCall: { toolName: "buscar_en_memoria" },
        toolExecutionMs: 300,
        toolOutput: { type: "tool-result" },
      },
      T0 + 1_400,
    );
    trace.stepFinished(paso(0), T0 + 1_500);
    trace.stepStarted(
      { stepNumber: 1, provider: "openai.responses", modelId: "gpt-6-luna" },
      T0 + 1_600,
    );
    trace.stepFinished(paso(1, { finishReason: "stop", cached: 0 }), T0 + 2_400);

    expect(trace.steps).toEqual([
      expect.objectContaining({
        stepIndex: 0,
        kind: "tool",
        name: "buscar_en_memoria",
        status: "ok",
        startedAt: new Date(T0 + 1_100),
        durationMs: 300,
      }),
      expect.objectContaining({
        stepIndex: 0,
        kind: "model",
        name: "openai:gpt-6-luna",
        status: "ok",
        startedAt: new Date(T0),
        durationMs: 900,
        inputTokens: 1_000,
        cachedInputTokens: 800,
      }),
      expect.objectContaining({ stepIndex: 1, kind: "model", cachedInputTokens: 0 }),
    ]);
  });

  it("una tool que falló queda con su error, recortado", () => {
    const trace = new RunTrace("run-2");
    trace.stepStarted({ stepNumber: 0, provider: "google.generative-ai", modelId: "x" }, T0);
    trace.toolFinished(
      {
        toolCall: { toolName: "crear_borrador_visual" },
        toolExecutionMs: 20,
        toolOutput: { type: "tool-error", error: new Error("e".repeat(500)) },
      },
      T0 + 100,
    );
    expect(trace.steps[0]).toMatchObject({ status: "error", kind: "tool" });
    expect(trace.steps[0]!.error).toHaveLength(300);
  });

  it("un turno cortado cierra el paso a medias como abortado; entre pasos no agrega nada", () => {
    const trace = new RunTrace("run-3");
    trace.stepStarted({ stepNumber: 0, provider: "openai.responses", modelId: "gpt-6-luna" }, T0);
    trace.close("aborted", undefined, T0 + 4_000);
    expect(trace.steps).toEqual([
      expect.objectContaining({
        kind: "model",
        name: "openai:gpt-6-luna",
        status: "aborted",
        durationMs: 4_000,
        error: null,
      }),
    ]);
    trace.close("aborted");
    expect(trace.steps).toHaveLength(1);
  });

  it("un paso que el proveedor cerró con error queda como error", () => {
    const trace = new RunTrace("run-4");
    trace.stepStarted({ stepNumber: 0, provider: "openai.responses", modelId: "gpt-6-luna" }, T0);
    trace.stepFinished(paso(0, { finishReason: "error" }), T0 + 1_000);
    expect(trace.steps[0]).toMatchObject({ status: "error" });
  });

  it("al cerrar un paso a medias pregunta quién corre ahora (cadena de respaldo) y usa el último error", () => {
    const trace = new RunTrace("run-5");
    let actual = { provider: "openai.responses", modelId: "gpt-6-luna" };
    trace.watchModel(() => actual);
    trace.stepStarted({ stepNumber: 0, ...actual }, T0);
    actual = { provider: "google.generative-ai", modelId: "gemini-3.8-flash" }; // cayó el principal
    trace.failed(new Error("503 del proveedor"));
    trace.close("error", undefined, T0 + 2_000);
    expect(trace.steps[0]).toMatchObject({
      name: "google:gemini-3.8-flash",
      status: "error",
      error: "503 del proveedor",
    });
  });

  it("errorText nunca guarda el objeto entero", () => {
    expect(errorText(new Error("se cayó"))).toBe("se cayó");
    expect(errorText({ code: 503 })).toBe("[object Object]");
  });
});
