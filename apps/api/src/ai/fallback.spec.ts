import { APICallError, type LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { generateText, jsonSchema, stepCountIs, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  createFallbackChain,
  FallbackExhaustedError,
  isFallbackError,
  type FallbackLink,
} from "./fallback.js";
import { parseModelEntry } from "./provider-registry.js";

// La cadena de respaldo (F10.7, ADR-004) sin red: cada eslabón es un mock del
// SDK. Lo que se prueba es la regla — qué cae al siguiente y qué no —, y que
// streamText/generateText la usan sin enterarse.

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const apiError = (statusCode: number, responseBody = "{}") =>
  new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "https://proveedor.test",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });

function streamOf(parts: LanguageModelV4StreamPart[]): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

const textParts = (text: string): LanguageModelV4StreamPart[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
];

interface Behavior {
  /** Lo que pasa en cada llamada, en orden; la última se repite. */
  steps: (() => unknown)[];
}

function link(entry: string, { steps }: Behavior): FallbackLink & { calls: () => number } {
  let calls = 0;
  const next = () => steps[Math.min(calls++, steps.length - 1)]!();
  const model = new MockLanguageModelV4({
    provider: parseModelEntry(entry).provider,
    modelId: parseModelEntry(entry).model,
    doStream: () =>
      Promise.resolve(next()).then((parts) => ({
        stream: streamOf(parts as LanguageModelV4StreamPart[]),
      })),
    doGenerate: () =>
      Promise.resolve(next()).then((parts) => ({
        content: [
          {
            type: "text" as const,
            text: (parts as LanguageModelV4StreamPart[])
              .flatMap((p) => (p.type === "text-delta" ? [p.delta] : []))
              .join(""),
          },
        ],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: USAGE,
        warnings: [],
      })),
  });
  return { entry: parseModelEntry(entry), model, calls: () => calls };
}

const ok = (text: string) => () => textParts(text);
const fails = (error: Error) => () => Promise.reject(error);

const FAST = { retryDelayMs: 0 };

describe("isFallbackError", () => {
  it("cae ante 5xx, 408, 409, 429, sin saldo y red", () => {
    for (const status of [500, 502, 503, 408, 409, 429, 402]) {
      expect(isFallbackError(apiError(status))).toBe(true);
    }
    expect(isFallbackError(apiError(400, '{"error":{"code":"insufficient_quota"}}'))).toBe(true);
    expect(
      isFallbackError(
        new APICallError({
          message: "Cannot connect to API",
          url: "x",
          requestBodyValues: {},
          isRetryable: true,
        }),
      ),
    ).toBe(true);
  });

  it("nunca ante un 400 de contenido, 401, 403 o 404", () => {
    expect(isFallbackError(apiError(400, '{"error":{"code":"content_policy_violation"}}'))).toBe(
      false,
    );
    for (const status of [401, 403, 404]) expect(isFallbackError(apiError(status))).toBe(false);
    expect(isFallbackError(new Error("bug nuestro"))).toBe(false);
  });

  it("un error de stream cae solo si el proveedor lo marca reintentable", () => {
    expect(isFallbackError({ message: "server_error", isRetryable: true })).toBe(true);
    expect(isFallbackError({ message: "invalid", isRetryable: false })).toBe(false);
  });
});

describe("createFallbackChain", () => {
  it("si el principal responde, corre él y no hay intentos", async () => {
    const principal = link("openai:gpt-6-luna@high", { steps: [ok("hola")] });
    const chain = createFallbackChain(
      [principal, link("google:gemini-3.8-flash", { steps: [ok("x")] })],
      FAST,
    );
    const result = await generateText({ model: chain.model, prompt: "p" });
    expect(result.text).toBe("hola");
    expect(chain.ran).toMatchObject({ id: "openai:gpt-6-luna", reasoning: "high" });
    expect(chain.attempts).toEqual([]);
  });

  it("un 503 suelto se reintenta en el mismo modelo antes de cambiar de voz", async () => {
    const principal = link("openai:gpt-6-luna", {
      steps: [fails(apiError(503)), ok("segundo intento")],
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("respaldo")] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    const result = await generateText({ model: chain.model, prompt: "p" });
    expect(result.text).toBe("segundo intento");
    expect(respaldo.calls()).toBe(0);
    expect(chain.attempts).toHaveLength(1);
  });

  it("si el principal sigue caído, responde el respaldo y quedan los intentos", async () => {
    const principal = link("openai:gpt-6-luna", { steps: [fails(apiError(503))] });
    const respaldo = link("google:gemini-3.8-flash@medium", { steps: [ok("de Gemini")] });
    const chain = createFallbackChain([principal, respaldo], FAST);

    const result = streamText({ model: chain.model, prompt: "p" });
    expect(await result.text).toBe("de Gemini");
    expect(chain.ran).toMatchObject({ id: "google:gemini-3.8-flash", reasoning: "medium" });
    expect(chain.attempts).toEqual([
      { id: "openai:gpt-6-luna", status: 503, error: "HTTP 503" },
      { id: "openai:gpt-6-luna", status: 503, error: "HTTP 503" },
    ]);
  });

  it("un 400 no cae al siguiente: se lanza tal cual", async () => {
    const principal = link("openai:gpt-6-luna", { steps: [fails(apiError(400))] });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("no debería")] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    await expect(generateText({ model: chain.model, prompt: "p" })).rejects.toThrow(/HTTP 400/);
    expect(respaldo.calls()).toBe(0);
    expect(principal.calls()).toBe(1);
  });

  it("un 401 tampoco: una key mal puesta se arregla, no se esconde", async () => {
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("no")] });
    const chain = createFallbackChain(
      [link("openai:gpt-6-luna", { steps: [fails(apiError(401))] }), respaldo],
      FAST,
    );
    await expect(generateText({ model: chain.model, prompt: "p" })).rejects.toThrow(/HTTP 401/);
    expect(respaldo.calls()).toBe(0);
  });

  it("si se cae toda la cadena, el error no es reintentable y el SDK no la repite", async () => {
    const principal = link("openai:gpt-6-luna", { steps: [fails(apiError(503))] });
    const respaldo = link("google:gemini-3.8-flash", { steps: [fails(apiError(429))] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    // maxRetries default (2): si el error fuera reintentable, el SDK llamaría 3 veces a la cadena.
    const error: unknown = await generateText({ model: chain.model, prompt: "p" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FallbackExhaustedError);
    expect(principal.calls() + respaldo.calls()).toBe(4);
    expect((error as FallbackExhaustedError).attempts.map((a) => a.status)).toEqual([
      503, 503, 429, 429,
    ]);
  });

  it("un error del stream ANTES de la primera salida cae al siguiente", async () => {
    const principal = link("openai:gpt-6-luna", {
      steps: [
        () => [
          { type: "stream-start", warnings: [] },
          { type: "error", error: { message: "server_error", isRetryable: true } },
        ],
      ],
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("rescate")] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    expect(await streamText({ model: chain.model, prompt: "p" }).text).toBe("rescate");
    expect(chain.ran.id).toBe("google:gemini-3.8-flash");
  });

  it("un error DESPUÉS de la primera salida no cambia de modelo a la mitad", async () => {
    const principal = link("openai:gpt-6-luna", {
      steps: [
        () => [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Hola, " },
          { type: "error", error: { message: "server_error", isRetryable: true } },
        ],
      ],
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("no")] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    const parts: string[] = [];
    for await (const part of streamText({ model: chain.model, prompt: "p" }).fullStream) {
      parts.push(part.type);
    }
    expect(parts).toContain("error");
    expect(respaldo.calls()).toBe(0);
    expect(chain.ran.id).toBe("openai:gpt-6-luna");
  });

  it("un proveedor que no contesta a tiempo cuenta como caído", async () => {
    const colgado = new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-6-luna",
      doStream: ({ abortSignal }) =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason));
            },
          }),
        }),
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("a tiempo")] });
    const chain = createFallbackChain(
      [{ entry: parseModelEntry("openai:gpt-6-luna"), model: colgado }, respaldo],
      { ...FAST, firstOutputTimeoutMs: 20 },
    );
    expect(await streamText({ model: chain.model, prompt: "p" }).text).toBe("a tiempo");
    expect(chain.attempts[0]?.error).toMatch(/Sin respuesta del proveedor/);
  });

  it("un 400 que llega justo al vencer el plazo es la respuesta real: no cae al siguiente", async () => {
    const tardio = new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-6-luna",
      doStream: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () => reject(apiError(400)));
        }),
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("no")] });
    const chain = createFallbackChain(
      [{ entry: parseModelEntry("openai:gpt-6-luna"), model: tardio }, respaldo],
      { ...FAST, firstOutputTimeoutMs: 20 },
    );
    const parts: string[] = [];
    for await (const part of streamText({ model: chain.model, prompt: "p" }).fullStream) {
      parts.push(part.type);
    }
    expect(parts).toContain("error");
    expect(respaldo.calls()).toBe(0);
  });

  it("si el usuario aborta, no se gasta otro modelo", async () => {
    const controller = new AbortController();
    const principal = link("openai:gpt-6-luna", {
      steps: [
        () => {
          controller.abort();
          return Promise.reject(apiError(503));
        },
      ],
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("no")] });
    const chain = createFallbackChain([principal, respaldo], FAST);
    await expect(
      generateText({ model: chain.model, prompt: "p", abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(respaldo.calls()).toBe(0);
  });

  it("un turno de varios pasos se queda con el respaldo: no mezcla voces ni reespera al caído", async () => {
    let principalCalls = 0;
    const principal = new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-6-luna",
      // Cae en el primer paso y "vuelve" en el segundo: aun así no debe usarse.
      doStream: () =>
        principalCalls++ < 2
          ? Promise.reject(apiError(503))
          : Promise.resolve({ stream: streamOf(textParts("Luna a la mitad")) }),
    });
    let respaldoCalls = 0;
    const respaldo = new MockLanguageModelV4({
      provider: "google",
      modelId: "gemini-3.8-flash",
      doStream: () =>
        Promise.resolve({
          stream: streamOf(
            respaldoCalls++ === 0
              ? [
                  { type: "stream-start", warnings: [] },
                  { type: "tool-call", toolCallId: "c1", toolName: "eco", input: "{}" },
                  {
                    type: "finish",
                    finishReason: { unified: "tool-calls", raw: "tool_calls" },
                    usage: USAGE,
                  },
                ]
              : textParts("Gemini termina"),
          ),
        }),
    });
    const chain = createFallbackChain(
      [
        { entry: parseModelEntry("openai:gpt-6-luna"), model: principal },
        { entry: parseModelEntry("google:gemini-3.8-flash"), model: respaldo },
      ],
      FAST,
    );
    const result = streamText({
      model: chain.model,
      prompt: "p",
      tools: { eco: { inputSchema: jsonSchema({ type: "object" }), execute: () => "ok" } },
      stopWhen: stepCountIs(3),
    });
    expect(await result.text).toBe("Gemini termina");
    expect(principalCalls).toBe(2);
    expect(respaldoCalls).toBe(2);
    expect(chain.attempts).toHaveLength(2);
  });

  it("si el principal ya respondió un paso, caer después no salta al respaldo a mitad del turno", async () => {
    let principalCalls = 0;
    const principal = new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-6-luna",
      doStream: () =>
        principalCalls++ === 0
          ? Promise.resolve({
              stream: streamOf([
                { type: "stream-start", warnings: [] },
                { type: "tool-call", toolCallId: "c1", toolName: "eco", input: "{}" },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage: USAGE,
                },
              ]),
            })
          : Promise.reject(apiError(503)),
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("Gemini a la mitad")] });
    const chain = createFallbackChain(
      [{ entry: parseModelEntry("openai:gpt-6-luna"), model: principal }, respaldo],
      FAST,
    );
    const result = streamText({
      model: chain.model,
      prompt: "p",
      tools: { eco: { inputSchema: jsonSchema({ type: "object" }), execute: () => "ok" } },
      stopWhen: stepCountIs(3),
    });
    await result.consumeStream();
    expect(respaldo.calls()).toBe(0);
    // Paso 1 a la primera, paso 2 con su reintento: 3 llamadas, todas a Luna.
    expect(principalCalls).toBe(3);
    expect(chain.ran.id).toBe("openai:gpt-6-luna");
  });

  it("tras un timeout no reintenta el mismo modelo: pasa directo al respaldo", async () => {
    let colgadoCalls = 0;
    const colgado = new MockLanguageModelV4({
      provider: "openai",
      modelId: "gpt-6-luna",
      doStream: ({ abortSignal }) => {
        colgadoCalls++;
        return Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              abortSignal?.addEventListener("abort", () => controller.error(abortSignal.reason));
            },
          }),
        });
      },
    });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("rápido")] });
    const chain = createFallbackChain(
      [{ entry: parseModelEntry("openai:gpt-6-luna"), model: colgado }, respaldo],
      { ...FAST, firstOutputTimeoutMs: 20 },
    );
    expect(await streamText({ model: chain.model, prompt: "p" }).text).toBe("rápido");
    expect(colgadoCalls).toBe(1);
  });

  it("el simulador finge caído al proveedor sin llamarlo", async () => {
    const principal = link("openai:gpt-6-luna", { steps: [ok("no")] });
    const respaldo = link("google:gemini-3.8-flash", { steps: [ok("simulado")] });
    const chain = createFallbackChain([principal, respaldo], { ...FAST, simulateDown: ["openai"] });
    expect((await generateText({ model: chain.model, prompt: "p" })).text).toBe("simulado");
    expect(principal.calls()).toBe(0);
    expect(chain.attempts[0]).toMatchObject({ id: "openai:gpt-6-luna", status: 503 });
  });
});
