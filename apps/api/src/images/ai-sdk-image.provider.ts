import { APICallError, generateImage, NoImageGeneratedError, type ImageModel } from "ai";
import { parseModelId, type ProviderId } from "../ai/provider-registry.js";
import type {
  ImageAspectRatio,
  ImageProvider,
  ImageRequest,
  ImageResult,
} from "./image-provider.js";

// El adapter real (ADR-025): cualquier modelo de imagen que el AI SDK sepa
// resolver. Lo que cambia entre proveedores está acá y en ningún otro lado.

// OpenAI no acepta proporciones, solo tres tamaños fijos. 4:5 no existe: el
// más cercano es 2:3 (1024x1536), más alto que lo que el feed muestra, y el
// recorte a 4:5 lo hace quien guarda la imagen (F10 PR3), no el adapter — un
// adapter que recorta decide por el producto qué parte de la imagen sobra.
const OPENAI_SIZES: Record<ImageAspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "4:5": "1024x1536",
  "16:9": "1536x1024",
};

// Lo que el proveedor devuelve cuando su sistema de seguridad rechaza el
// pedido. OpenAI responde 400 con `moderation_blocked`; Gemini no responde
// error, responde sin imagen, y eso lo atrapa NoImageGeneratedError.
const OPENAI_BLOCKED = /moderation_blocked|safety system|safety_violations/i;

export class AiSdkImageProvider implements ImageProvider {
  readonly provider: ProviderId;
  readonly modelName: string;

  constructor(
    private readonly model: ImageModel,
    modelId: string,
  ) {
    const { provider, model: modelName } = parseModelId(modelId);
    this.provider = provider;
    this.modelName = modelName;
  }

  async generate(request: ImageRequest): Promise<ImageResult> {
    const prompt = request.reference
      ? { text: request.prompt, images: [request.reference.data] }
      : request.prompt;

    try {
      const result = await generateImage({
        model: this.model,
        prompt,
        ...(this.provider === "openai"
          ? {
              size: OPENAI_SIZES[request.aspectRatio],
              // Explícito: el default de gpt-image es "auto", que en la
              // práctica elige "high" y cuesta 4x lo que se tarifó (ADR-025).
              providerOptions: { openai: { quality: "medium" } },
            }
          : { aspectRatio: request.aspectRatio }),
      });

      return {
        kind: "image",
        data: result.image.uint8Array,
        mediaType: result.image.mediaType,
        usage: result.usage,
        providerRaw: {
          usage: result.usage,
          providerMetadata: result.providerMetadata,
          warnings: result.warnings,
        },
      };
    } catch (error) {
      if (NoImageGeneratedError.isInstance(error)) {
        return {
          kind: "blocked",
          providerRaw: { error: error.message, responses: error.responses ?? null },
        };
      }
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        OPENAI_BLOCKED.test(error.responseBody ?? error.message)
      ) {
        return {
          kind: "blocked",
          providerRaw: { error: error.message, responseBody: error.responseBody ?? null },
        };
      }
      throw error;
    }
  }
}
