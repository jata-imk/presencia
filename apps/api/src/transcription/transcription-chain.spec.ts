import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { FallbackExhaustedError } from "../ai/fallback.js";
import { TranscriptionChain, type TranscriptionLink } from "./transcription-chain.js";

// La cadena de transcripción (F11, ADR-030) sin red: cada modelo es un doble
// que hace lo que le digamos. Lo que se prueba es la regla de ai/fallback.ts:
// qué cae al siguiente, qué no, que el detener no salte, y quién transcribió.

const AUDIO = new Uint8Array([1, 2, 3]);

const apiError = (statusCode: number) =>
  new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "https://stt.test",
    requestBodyValues: {},
    statusCode,
  });

function modelo(
  id: string,
  steps: ((signal: AbortSignal) => Promise<{ text: string; raw: unknown }>)[],
): TranscriptionLink & { calls: () => number } {
  const [provider, modelName] = id.split(":") as [string, string];
  let calls = 0;
  return {
    provider,
    modelName,
    calls: () => calls,
    run: (_audio, signal) => steps[Math.min(calls++, steps.length - 1)]!(signal),
  };
}

const ok = (text: string) => () => Promise.resolve({ text, raw: { language: "es" } });
const FAST = { retryDelayMs: 0 };

describe("TranscriptionChain", () => {
  it("si el principal contesta, el texto dice que fue él y no hay intentos", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [ok("hola")]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("no")]);
    const result = await new TranscriptionChain([groq, openai], FAST).transcribe(AUDIO);
    expect(result).toEqual({
      text: "hola",
      raw: { language: "es" },
      ran: {
        provider: "groq",
        modelName: "whisper-large-v3-turbo",
        fallbackFrom: null,
        attempts: [],
      },
    });
    expect(openai.calls()).toBe(0);
  });

  it("un 429 (el límite del plan gratis de Groq) reintenta una vez y cae al respaldo", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [() => Promise.reject(apiError(429))]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("respaldo")]);
    const { text, ran } = await new TranscriptionChain([groq, openai], FAST).transcribe(AUDIO);
    expect(text).toBe("respaldo");
    expect(groq.calls()).toBe(2);
    expect(ran).toMatchObject({
      provider: "openai",
      fallbackFrom: "groq:whisper-large-v3-turbo",
    });
    expect(ran.attempts.map((a) => a.status)).toEqual([429, 429]);
  });

  it("un 400 (un audio que el proveedor no lee) no cae al siguiente", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [() => Promise.reject(apiError(400))]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("no")]);
    await expect(new TranscriptionChain([groq, openai], FAST).transcribe(AUDIO)).rejects.toThrow(
      "HTTP 400",
    );
    expect(openai.calls()).toBe(0);
  });

  it("AI_FALLBACK_SIMULATE finge caído al principal sin llamarlo", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [ok("no")]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("respaldo")]);
    const { ran } = await new TranscriptionChain([groq, openai], {
      ...FAST,
      simulateDown: ["groq"],
    }).transcribe(AUDIO);
    expect(groq.calls()).toBe(0);
    expect(ran.provider).toBe("openai");
  });

  it("si todos caen, FallbackExhaustedError con cada intento", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [() => Promise.reject(apiError(503))]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [() => Promise.reject(apiError(500))]);
    const error = await new TranscriptionChain([groq, openai], FAST)
      .transcribe(AUDIO)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FallbackExhaustedError);
    expect((error as FallbackExhaustedError).attempts).toHaveLength(4);
  });

  it("un modelo colgado vence el plazo y cae al siguiente sin reintentarlo", async () => {
    const colgado = (signal: AbortSignal) =>
      new Promise<never>((_r, reject) => {
        signal.addEventListener("abort", () => reject(new Error("abortado")));
      });
    const groq = modelo("groq:whisper-large-v3-turbo", [colgado]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("respaldo")]);
    const { ran } = await new TranscriptionChain([groq, openai], {
      ...FAST,
      attemptTimeoutMs: 20,
      budgetMs: 60_000,
    }).transcribe(AUDIO);
    expect(groq.calls()).toBe(1);
    expect(ran.provider).toBe("openai");
  });

  it("si el REINTENTO del principal da un 400, se lanza ese error, sin culpar al respaldo", async () => {
    const groq = modelo("groq:whisper-large-v3-turbo", [
      () => Promise.reject(apiError(503)),
      () => Promise.reject(apiError(400)),
    ]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("no")]);
    const error = await new TranscriptionChain([groq, openai], FAST)
      .transcribe(AUDIO)
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe("HTTP 400");
    expect(openai.calls()).toBe(0);
  });

  it("detener durante la pausa antes del reintento la corta, sin esperar", async () => {
    const controller = new AbortController();
    const groq = modelo("groq:whisper-large-v3-turbo", [
      () => {
        setTimeout(() => controller.abort(), 5);
        return Promise.reject(apiError(503));
      },
    ]);
    const inicio = Date.now();
    await expect(
      new TranscriptionChain([groq], { retryDelayMs: 10_000 }).transcribe(AUDIO, controller.signal),
    ).rejects.toThrow();
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(groq.calls()).toBe(1);
  });

  it("el detener del creator corta la llamada y no pasa al respaldo", async () => {
    const controller = new AbortController();
    const groq = modelo("groq:whisper-large-v3-turbo", [
      (signal) =>
        new Promise((_r, reject) => {
          signal.addEventListener("abort", () => reject(new Error("abortado")));
          controller.abort();
        }),
    ]);
    const openai = modelo("openai:gpt-4o-mini-transcribe", [ok("no")]);
    await expect(
      new TranscriptionChain([groq, openai], FAST).transcribe(AUDIO, controller.signal),
    ).rejects.toThrow();
    expect(openai.calls()).toBe(0);
  });
});
