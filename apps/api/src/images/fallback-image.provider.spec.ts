import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { FallbackImageProvider } from "./fallback-image.provider.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./image-provider.js";

// La cadena de imagen (F10.7, ADR-025) sin red: cada generador es un doble
// que hace lo que le digamos. Lo que se prueba es la regla: qué cae al
// siguiente, qué no, y que el resultado diga quién dibujó.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const REQUEST: ImageRequest = { prompt: "tacos", aspectRatio: "4:5" };

const apiError = (statusCode: number) =>
  new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "https://generador.test",
    requestBodyValues: {},
    statusCode,
  });

const image = (): ImageResult => ({
  kind: "image",
  data: PNG,
  mediaType: "image/png",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  providerRaw: {},
});

function generador(
  id: string,
  steps: ((request: ImageRequest) => Promise<ImageResult>)[],
): ImageProvider & { calls: () => number } {
  const [provider, modelName] = id.split(":") as [string, string];
  let calls = 0;
  return {
    provider,
    modelName,
    calls: () => calls,
    generate: (request) => steps[Math.min(calls++, steps.length - 1)]!(request),
  };
}

const FAST = { retryDelayMs: 0 };

describe("FallbackImageProvider", () => {
  it("si el principal dibuja, la imagen dice que fue él y no hay intentos", async () => {
    const principal = generador("xai:grok-imagine-image-2.0", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([principal], FAST);
    await expect(chain.generate(REQUEST)).resolves.toMatchObject({
      kind: "image",
      ran: {
        provider: "xai",
        modelName: "grok-imagine-image-2.0",
        fallbackFrom: null,
        attempts: [],
      },
    });
  });

  it("si el principal está caído, dibuja el respaldo y la imagen lo dice", async () => {
    const principal = generador("xai:grok-imagine-image-2.0", [
      () => Promise.reject(apiError(503)),
    ]);
    const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([principal, respaldo], FAST);
    const result = await chain.generate(REQUEST);
    expect(result.ran).toMatchObject({
      provider: "google",
      modelName: "gemini-3.1-flash-image",
      fallbackFrom: "xai:grok-imagine-image-2.0",
    });
    // Un reintento en el mismo antes de cambiar.
    expect(principal.calls()).toBe(2);
    expect(result.ran?.attempts).toHaveLength(2);
  });

  it("un bloqueo NUNCA cae al siguiente: sería esquivar la moderación", async () => {
    const principal = generador("xai:grok-imagine-image-2.0", [
      () => Promise.resolve({ kind: "blocked", providerRaw: {} }),
    ]);
    const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([principal, respaldo], FAST);
    await expect(chain.generate(REQUEST)).resolves.toMatchObject({
      kind: "blocked",
      ran: { provider: "xai" },
    });
    expect(respaldo.calls()).toBe(0);
  });

  it("un 400 o un 401 se lanzan: no son caídas", async () => {
    for (const status of [400, 401]) {
      const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
      const chain = new FallbackImageProvider(
        [
          generador("xai:grok-imagine-image-2.0", [() => Promise.reject(apiError(status))]),
          respaldo,
        ],
        FAST,
      );
      await expect(chain.generate(REQUEST)).rejects.toThrow(`HTTP ${String(status)}`);
      expect(respaldo.calls()).toBe(0);
    }
  });

  it("un generador colgado cuenta como caído, sin reintentarlo", async () => {
    const colgado = generador("xai:grok-imagine-image-2.0", [
      (request) =>
        new Promise((_, reject) => {
          request.abortSignal?.addEventListener("abort", () => reject(new Error("abortado")));
        }),
    ]);
    const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([colgado, respaldo], {
      ...FAST,
      attemptTimeoutMs: 20,
    });
    const result = await chain.generate(REQUEST);
    expect(result.ran?.provider).toBe("google");
    expect(colgado.calls()).toBe(1);
    expect(result.ran?.attempts[0]?.error).toMatch(/Sin respuesta del proveedor/);
  });

  it("si todos caen, el error lista cada intento", async () => {
    const chain = new FallbackImageProvider(
      [
        generador("xai:grok-imagine-image-2.0", [() => Promise.reject(apiError(503))]),
        generador("google:gemini-3.1-flash-image", [() => Promise.reject(apiError(429))]),
      ],
      FAST,
    );
    await expect(chain.generate(REQUEST)).rejects.toThrow(
      /Todos los modelos de la cadena fallaron: .*xai:grok-imagine-image-2\.0 \(503.*google:gemini-3\.1-flash-image \(429/,
    );
  });

  it("un 400 que llega justo al vencer el plazo es la respuesta real: no cae al siguiente", async () => {
    const principal = generador("xai:grok-imagine-image-2.0", [
      (request) =>
        new Promise((_, reject) => {
          request.abortSignal?.addEventListener("abort", () => reject(apiError(400)));
        }),
    ]);
    const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([principal, respaldo], {
      ...FAST,
      attemptTimeoutMs: 20,
    });
    await expect(chain.generate(REQUEST)).rejects.toThrow("HTTP 400");
    expect(respaldo.calls()).toBe(0);
  });

  it("respeta el presupuesto total: no empieza un intento que ya no alcanzaría", async () => {
    const lento = (request: ImageRequest) =>
      new Promise<ImageResult>((_, reject) => {
        request.abortSignal?.addEventListener("abort", () => reject(new Error("abortado")));
      });
    const principal = generador("xai:grok-imagine-image-2.0", [lento]);
    const respaldo = generador("google:gemini-3.1-flash-image", [lento]);
    const chain = new FallbackImageProvider([principal, respaldo], {
      ...FAST,
      attemptTimeoutMs: 10_000,
      // El primer intento se come todo el presupuesto: el respaldo no arranca.
      budgetMs: 10_050,
    });
    const started = Date.now();
    await expect(chain.generate(REQUEST)).rejects.toThrow(
      /Todos los modelos de la cadena fallaron/,
    );
    expect(respaldo.calls()).toBe(0);
    expect(Date.now() - started).toBeLessThan(11_000);
  }, 15_000);

  it("si el respaldo falla con un error que no es caída, el error dice que el principal ya había caído", async () => {
    const chain = new FallbackImageProvider(
      [
        generador("google:gemini-3.1-flash-image", [() => Promise.reject(apiError(503))]),
        generador("openai:gpt-image-2", [() => Promise.reject(apiError(401))]),
      ],
      FAST,
    );
    const error: unknown = await chain.generate(REQUEST).catch((e: unknown) => e);
    expect((error as Error).message).toContain(
      "openai:gpt-image-2 falló tras caer el principal (google:gemini-3.1-flash-image: 503",
    );
    expect((error as Error).message).toContain("HTTP 401");
  });

  it("el simulador finge caído al proveedor sin llamarlo", async () => {
    const principal = generador("xai:grok-imagine-image-2.0", [() => Promise.resolve(image())]);
    const respaldo = generador("google:gemini-3.1-flash-image", [() => Promise.resolve(image())]);
    const chain = new FallbackImageProvider([principal, respaldo], {
      ...FAST,
      simulateDown: ["xai"],
    });
    expect((await chain.generate(REQUEST)).ran?.provider).toBe("google");
    expect(principal.calls()).toBe(0);
  });
});
