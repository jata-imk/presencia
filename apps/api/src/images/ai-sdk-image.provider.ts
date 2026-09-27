import {
  APICallError,
  generateImage,
  NoImageGeneratedError,
  wrapImageModel,
  type ImageModel,
  type ImageModelUsage,
} from "ai";
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

// OpenAI rechaza con un 400 que lo dice en el cuerpo.
const OPENAI_BLOCKED = /moderation_blocked|safety system|safety_violations/i;

/** Lo que devolvió el modelo antes de que `generateImage` decidiera si había imagen. */
interface Crudo {
  usage?: ImageModelUsage;
  providerMetadata?: Record<string, unknown>;
}

/**
 * Gemini no rechaza con un error: responde sin imagen. Pero también responde
 * sin imagen cuando contesta solo con texto o corta antes de tiempo, y eso no
 * es un bloqueo — tratarlo como uno le diría al usuario "cambia tu pedido"
 * por algo que se arregla reintentando. Solo cuenta como bloqueo si el
 * proveedor lo dice: el prompt vino bloqueado o alguna categoría de seguridad
 * quedó marcada.
 */
function geminiBloqueo(crudo: Crudo): boolean {
  const google = crudo.providerMetadata?.google as
    | {
        promptFeedback?: { blockReason?: string | null } | null;
        safetyRatings?: { blocked?: boolean | null }[] | null;
      }
    | undefined;
  if (google?.promptFeedback?.blockReason) return true;
  return google?.safetyRatings?.some((rating) => rating.blocked === true) ?? false;
}

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

    // Cuando no hay imagen, `generateImage` lanza y se lleva el usage y la
    // metadata que el modelo sí devolvió — y un bloqueo de Gemini igual cobra
    // los tokens de entrada. El middleware los guarda antes. Uno por llamada,
    // no uno por instancia: las dos variantes corren en paralelo sobre el
    // mismo provider.
    const crudo: Crudo = {};
    const model = wrapImageModel({
      model: this.model,
      middleware: {
        wrapGenerate: async ({ doGenerate }) => {
          const result = await doGenerate();
          crudo.usage = result.usage;
          crudo.providerMetadata = result.providerMetadata;
          return result;
        },
      },
    });

    try {
      const result = await generateImage({
        model,
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
      if (NoImageGeneratedError.isInstance(error) && geminiBloqueo(crudo)) {
        return {
          kind: "blocked",
          usage: crudo.usage,
          providerRaw: { error: error.message, ...crudo },
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
      // Sin imagen y sin señal de bloqueo: falla del sistema, se puede
      // reintentar. Se adjunta lo que el modelo sí devolvió para el log.
      if (NoImageGeneratedError.isInstance(error)) {
        throw new Error(
          `El generador respondió sin imagen y sin marcar bloqueo: ${JSON.stringify(crudo.providerMetadata ?? null)}`,
          { cause: error },
        );
      }
      throw error;
    }
  }
}
