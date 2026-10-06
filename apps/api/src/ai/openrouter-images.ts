import {
  APICallError,
  NoSuchModelError,
  type ImageModelV4,
  type ImageModelV4CallOptions,
  type ImageModelV4File,
  type ImageModelV4Result,
  type ProviderV4,
} from "@ai-sdk/provider";

// OpenRouter como proveedor de imágenes (F10.7, ADR-025): una key para Muse
// (Meta) y MAI-Image (Microsoft). Adapter propio porque ninguno sirve:
// `@openrouter/ai-sdk-provider` no tiene modelos de imagen, y su API
// (`POST /api/v1/images`) no es `/images/generations`, así que el provider
// compatible con OpenAI le pegaría a otra ruta con otros parámetros.
//
// Contrato tomado de su spec de máquina (openrouter.ai/openapi.json,
// `createImages`, 2026-10-06): `aspect_ratio` y `resolution` normalizados
// (cada proveedor los ajusta a lo que soporta), `input_references` como data
// URLs para editar, y la respuesta en `data[].b64_json` con `usage.cost` en
// dólares.

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterImageResponse {
  data?: { b64_json?: string; media_type?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number | null;
  };
}

function referenceUrl(file: ImageModelV4File): string {
  if (file.type === "url") return file.url;
  const base64 =
    typeof file.data === "string" ? file.data : Buffer.from(file.data).toString("base64");
  return `data:${file.mediaType};base64,${base64}`;
}

// 408/409/429/5xx (incluye 524 y 529 de OpenRouter) son reintentables: lo
// mismo que marca el SDK, para que la cadena de respaldo los trate igual.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

class OpenRouterImageModel implements ImageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "openrouter.image";
  // Una llamada = una imagen (ADR-025), y MAI acepta n = 1 nada más.
  readonly maxImagesPerCall = 1;

  constructor(
    readonly modelId: string,
    private readonly config: { apiKey: string; baseUrl: string; fetch?: typeof fetch },
  ) {}

  async doGenerate(options: ImageModelV4CallOptions): Promise<ImageModelV4Result> {
    const url = `${this.config.baseUrl}/images`;
    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
      n: options.n,
      ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.files?.length
        ? {
            input_references: options.files.map((file) => ({
              type: "image_url",
              image_url: { url: referenceUrl(file) },
            })),
          }
        : {}),
      ...(options.providerOptions.openrouter ?? {}),
    };
    const warnings: ImageModelV4Result["warnings"] = [];
    if (options.size) {
      warnings.push({
        type: "unsupported",
        feature: "size",
        details: "OpenRouter usa aspect_ratio.",
      });
    }
    if (options.mask) {
      warnings.push({
        type: "unsupported",
        feature: "mask",
        details: "OpenRouter no acepta máscara.",
      });
    }

    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });
    } catch (error) {
      if (options.abortSignal?.aborted) throw error;
      // Sin respuesta: red. Reintentable, como en el SDK.
      throw new APICallError({
        message: `No se pudo conectar con OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
        url,
        requestBodyValues: body,
        cause: error,
        isRetryable: true,
      });
    }

    const text = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());
    if (!response.ok) {
      let message = `OpenRouter respondió ${String(response.status)}`;
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // cuerpo que no es JSON: se queda el status
      }
      throw new APICallError({
        message,
        url,
        requestBodyValues: body,
        statusCode: response.status,
        responseHeaders,
        responseBody: text,
        isRetryable: isRetryableStatus(response.status),
      });
    }

    let parsed: OpenRouterImageResponse;
    try {
      parsed = JSON.parse(text) as OpenRouterImageResponse;
    } catch (error) {
      // Un 200 con HTML o cortado (un proxy, un timeout a medias): transitorio.
      throw new APICallError({
        message: "OpenRouter respondió 200 con un cuerpo que no es JSON",
        url,
        requestBodyValues: body,
        statusCode: response.status,
        responseHeaders,
        responseBody: text.slice(0, 2000),
        cause: error,
        isRetryable: true,
      });
    }
    const images = (parsed.data ?? []).flatMap((item) => (item.b64_json ? [item.b64_json] : []));
    return {
      images,
      warnings,
      usage: {
        inputTokens: parsed.usage?.prompt_tokens,
        outputTokens: parsed.usage?.completion_tokens,
        totalTokens: parsed.usage?.total_tokens,
      },
      // El costo que OpenRouter cobró de verdad, en dólares: va al crudo de
      // `ai_usage_events`, y sirve para revisar los precios de model-prices.ts.
      providerMetadata: { openrouter: { images: [], cost: parsed.usage?.cost ?? null } },
      response: { timestamp: new Date(), modelId: this.modelId, headers: responseHeaders },
    };
  }
}

/**
 * El proveedor para el registry (`PROVIDERS.openrouter`). Solo dibuja: pedirle
 * un modelo de texto es un error de configuración, y se dice con el nombre.
 */
export function createOpenRouterImages(config: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): ProviderV4 {
  const settings = { ...config, baseUrl: config.baseUrl ?? OPENROUTER_BASE_URL };
  return {
    specificationVersion: "v4",
    imageModel: (modelId) => new OpenRouterImageModel(modelId, settings),
    languageModel: (modelId) => {
      throw new NoSuchModelError({ modelId, modelType: "languageModel" });
    },
    embeddingModel: (modelId) => {
      throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
    },
  };
}
