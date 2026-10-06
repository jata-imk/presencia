import { APICallError } from "@ai-sdk/provider";
import { generateImage } from "ai";
import { describe, expect, it } from "vitest";
import { AiSdkImageProvider } from "../images/ai-sdk-image.provider.js";
import { createOpenRouterImages } from "./openrouter-images.js";

// El adapter de OpenRouter sin red (F10.7): un fetch falso que guarda lo que
// recibió y contesta lo que le digamos. Lo que se prueba es el contrato de su
// spec (`POST /images`), no la API real — eso es el bake-off.

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch: fn, calls };
}

const OK = {
  created: 1,
  data: [{ b64_json: PNG_B64, media_type: "image/png" }],
  usage: { prompt_tokens: 12, completion_tokens: 4175, total_tokens: 4187, cost: 0.01 },
};

describe("OpenRouter: modelo de imagen", () => {
  it("le pega a /images con el modelo, la proporción, la resolución y la key", async () => {
    const { fetch, calls } = fakeFetch(200, OK);
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");

    const result = await generateImage({
      model,
      prompt: "tacos al pastor",
      aspectRatio: "4:5",
      providerOptions: { openrouter: { resolution: "1K" } },
    });

    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/images");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer k");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      model: "meta/muse-image",
      prompt: "tacos al pastor",
      n: 1,
      aspect_ratio: "4:5",
      resolution: "1K",
    });
    expect(result.image.mediaType).toBe("image/png");
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4175 });
  });

  it("el costo real que cobró OpenRouter llega al crudo de la telemetría", async () => {
    const { fetch } = fakeFetch(200, OK);
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
    const provider = new AiSdkImageProvider(model, "openrouter:meta/muse-image");
    const result = await provider.generate({ prompt: "x", aspectRatio: "4:5" });
    expect(result).toMatchObject({
      kind: "image",
      providerRaw: { providerMetadata: { openrouter: { cost: 0.01 } } },
    });
  });

  it("al editar manda la imagen de partida como data URL en input_references", async () => {
    const { fetch, calls } = fakeFetch(200, OK);
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel(
      "microsoft/mai-image-2.6",
    );
    const png = Buffer.from(PNG_B64, "base64");

    await generateImage({
      model,
      prompt: { text: "más cálida", images: [png] },
      aspectRatio: "1:1",
    });

    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body.input_references).toEqual([
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG_B64}` } },
    ]);
  });

  it("un 5xx o un 429 es reintentable (la cadena de respaldo lo usa); un 400 no", async () => {
    for (const [status, retryable] of [
      [502, true],
      [529, true],
      [429, true],
      [400, false],
      [402, false],
    ] as const) {
      const { fetch } = fakeFetch(status, {
        error: { code: status, message: `falla ${String(status)}` },
      });
      const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
      const error: unknown = await Promise.resolve(
        model.doGenerate({
          prompt: "x",
          n: 1,
          size: undefined,
          aspectRatio: "1:1",
          seed: undefined,
          files: undefined,
          mask: undefined,
          providerOptions: {},
        }),
      ).catch((e: unknown) => e);
      expect(APICallError.isInstance(error)).toBe(true);
      expect((error as APICallError).statusCode).toBe(status);
      expect((error as APICallError).message).toBe(`falla ${String(status)}`);
      expect((error as APICallError).isRetryable).toBe(retryable);
    }
  });

  it("sin conexión es un error de red reintentable", async () => {
    const fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof globalThis.fetch;
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
    await expect(generateImage({ model, prompt: "x", maxRetries: 0 })).rejects.toMatchObject({
      isRetryable: true,
    });
  });

  it("una negativa por moderación es un bloqueo de la card, no un error del sistema", async () => {
    const { fetch } = fakeFetch(403, {
      error: { code: 403, message: "Your input was flagged by moderation" },
    });
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
    const provider = new AiSdkImageProvider(model, "openrouter:meta/muse-image");
    await expect(provider.generate({ prompt: "x", aspectRatio: "1:1" })).resolves.toMatchObject({
      kind: "blocked",
    });
  });

  it("un 403 de permisos NO es un bloqueo: es configuración, y debe verse como error", async () => {
    const { fetch } = fakeFetch(403, {
      error: { code: 403, message: "You are not allowed to sample from this model" },
    });
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
    const provider = new AiSdkImageProvider(model, "openrouter:meta/muse-image");
    await expect(provider.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toThrow(
      /not allowed to sample/,
    );
  });

  it("un 200 que no es JSON es un error reintentable con el cuerpo para diagnosticar", async () => {
    const { fetch } = fakeFetch(200, "<html>Gateway timeout</html>");
    const model = createOpenRouterImages({ apiKey: "k", fetch }).imageModel("meta/muse-image");
    await expect(generateImage({ model, prompt: "x", maxRetries: 0 })).rejects.toMatchObject({
      isRetryable: true,
      responseBody: "<html>Gateway timeout</html>",
    });
  });

  it("no da modelos de texto: es un error de configuración con nombre", () => {
    expect(() => createOpenRouterImages({ apiKey: "k" }).languageModel("x")).toThrow(/x/);
  });
});
