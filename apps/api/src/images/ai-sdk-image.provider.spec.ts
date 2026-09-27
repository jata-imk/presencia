import { APICallError } from "ai";
import { MockImageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AiSdkImageProvider } from "./ai-sdk-image.provider.js";
import { FAKE_BLOCK_MARKER, FakeImageProvider } from "./fake-image.provider.js";

// Sin red: el modelo es un mock del SDK. Lo que se prueba es lo que el adapter
// decide — cómo traduce la proporción, qué manda al editar y qué cuenta como
// bloqueo —, no la API del proveedor (eso es el bake-off, ADR-025).

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function modelo(
  doGenerate: MockImageModelV4["doGenerate"] = () =>
    Promise.resolve({
      images: [PNG],
      warnings: [],
      response: { timestamp: new Date(), modelId: "m", headers: undefined },
      usage: { inputTokens: 10, outputTokens: 1290, totalTokens: 1300 },
    }),
) {
  const llamadas: Parameters<MockImageModelV4["doGenerate"]>[0][] = [];
  const model = new MockImageModelV4({
    maxImagesPerCall: 1,
    doGenerate: async (options) => {
      llamadas.push(options);
      return doGenerate(options);
    },
  });
  return { model, llamadas };
}

describe("AiSdkImageProvider", () => {
  it("con Google pide la proporción tal cual y devuelve los bytes con su usage", async () => {
    const { model, llamadas } = modelo();
    const provider = new AiSdkImageProvider(model, "google:gemini-3.1-flash-image");

    const result = await provider.generate({ prompt: "tacos al pastor", aspectRatio: "4:5" });

    expect(llamadas[0]).toMatchObject({ prompt: "tacos al pastor", aspectRatio: "4:5", n: 1 });
    expect(llamadas[0]?.size).toBeUndefined();
    expect(result).toMatchObject({ kind: "image", mediaType: "image/png" });
    expect(result.kind === "image" && result.usage.outputTokens).toBe(1290);
    expect(provider).toMatchObject({ provider: "google", modelName: "gemini-3.1-flash-image" });
  });

  it("con OpenAI traduce la proporción a tamaño y fija la calidad media", async () => {
    const { model, llamadas } = modelo();
    const provider = new AiSdkImageProvider(model, "openai:gpt-image-1.5");

    await provider.generate({ prompt: "x", aspectRatio: "4:5" });
    await provider.generate({ prompt: "x", aspectRatio: "16:9" });

    expect(llamadas[0]).toMatchObject({ size: "1024x1536", aspectRatio: undefined });
    expect(llamadas[0]?.providerOptions).toEqual({ openai: { quality: "medium" } });
    expect(llamadas[1]?.size).toBe("1536x1024");
  });

  it("al editar manda la imagen de referencia junto con la instrucción", async () => {
    const { model, llamadas } = modelo();
    const provider = new AiSdkImageProvider(model, "google:gemini-3.1-flash-image");

    await provider.generate({
      prompt: "más cálida",
      aspectRatio: "1:1",
      reference: { data: PNG, mediaType: "image/png" },
    });

    expect(llamadas[0]?.prompt).toBe("más cálida");
    expect(llamadas[0]?.files).toHaveLength(1);
  });

  it("sin imagen en la respuesta es un bloqueo, no un error", async () => {
    const { model } = modelo(() =>
      Promise.resolve({
        images: [],
        warnings: [],
        response: { timestamp: new Date(), modelId: "m", headers: undefined },
      }),
    );
    const provider = new AiSdkImageProvider(model, "google:gemini-3.1-flash-image");

    await expect(provider.generate({ prompt: "x", aspectRatio: "1:1" })).resolves.toMatchObject({
      kind: "blocked",
    });
  });

  it("el rechazo de moderación de OpenAI es un bloqueo", async () => {
    const { model } = modelo(() =>
      Promise.reject(
        new APICallError({
          message: "Your request was rejected by the safety system.",
          url: "https://api.openai.com/v1/images/generations",
          requestBodyValues: {},
          statusCode: 400,
          responseBody: '{"error":{"code":"moderation_blocked"}}',
          isRetryable: false,
        }),
      ),
    );
    const provider = new AiSdkImageProvider(model, "openai:gpt-image-1.5");

    await expect(provider.generate({ prompt: "x", aspectRatio: "1:1" })).resolves.toMatchObject({
      kind: "blocked",
    });
  });

  it("cualquier otra falla se propaga: es del sistema, no del contenido", async () => {
    const { model } = modelo(() =>
      Promise.reject(
        new APICallError({
          message: "Internal error",
          url: "u",
          requestBodyValues: {},
          statusCode: 500,
          isRetryable: false,
        }),
      ),
    );
    const provider = new AiSdkImageProvider(model, "openai:gpt-image-1.5");

    await expect(provider.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toThrow(
      /Internal error/,
    );
  });
});

describe("FakeImageProvider", () => {
  it("devuelve un PNG válido con la proporción pedida, distinto por variante", async () => {
    const fake = new FakeImageProvider();
    const a = await fake.generate({ prompt: "p", aspectRatio: "4:5" });
    const b = await fake.generate({ prompt: "p", aspectRatio: "4:5" });

    if (a.kind !== "image" || b.kind !== "image") throw new Error("esperaba imágenes");
    const png = Buffer.from(a.data);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 80]);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false);
  });

  it(`simula el bloqueo con ${FAKE_BLOCK_MARKER}`, async () => {
    const fake = new FakeImageProvider();
    await expect(
      fake.generate({ prompt: `un logo ${FAKE_BLOCK_MARKER}`, aspectRatio: "1:1" }),
    ).resolves.toMatchObject({ kind: "blocked" });
  });
});
