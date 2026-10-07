import {
  APICallError,
  generateImage,
  NoImageGeneratedError,
  wrapImageModel,
  type ImageModelUsage,
} from "ai";
import { parseModelId, type ProviderId, type ResolvedImageModel } from "../ai/provider-registry.js";
import { imageCallOptions } from "./image-models.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./image-provider.js";

// El adapter real (ADR-025): cualquier modelo de imagen que el AI SDK sepa
// resolver. Lo que cambia entre proveedores está acá y en ningún otro lado.

// Un generador que se niega a dibujar responde 400 o 403 con el motivo en el
// cuerpo: OpenAI `moderation_blocked`; MAI-Image por OpenRouter (Azure) un
// 400 "Response content blocked by label 'DallEBlockList'" o "Input content
// violated mainline safety policies" (vistos en el bake-off de F10.7); xAI y OpenRouter no lo documentan en su spec, así que se
// reconoce por el texto. Solo palabras de moderación: un "not allowed" o un
// 403 de permisos es un problema de configuración, y mostrarlo como "pide
// otra cosa" lo escondería. Lo que no se reconozca queda como error — que
// tampoco dispara respaldo (es 4xx), y sí deja rastro.
const BLOCKED_BODY =
  /moderation|safety system|safety_violations|flagged|content[ _-]?policy|content blocked by label|mainline safety polic/i;

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
    // El objeto, no el id en texto: `wrapImageModel` necesita el modelo ya resuelto.
    private readonly model: ResolvedImageModel,
    modelId: string,
    /**
     * Reintentos del SDK ante errores de API. Dentro de la cadena de respaldo
     * van en 0: reintenta la cadena, que además sabe cuándo cambiar de
     * generador. Suelto (bake-off, ejemplos de estilos), el default del SDK.
     */
    private readonly options: { maxRetries?: number } = {},
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
    // no uno por instancia: los slides de un carrusel corren en paralelo
    // sobre el mismo provider.
    const crudo: Crudo = {};
    const model = wrapImageModel({
      model: this.model,
      middleware: {
        wrapGenerate: async ({ doGenerate }) => {
          const result = await doGenerate();
          crudo.usage = result.usage;
          crudo.providerMetadata = result.providerMetadata;
          // Desde ai 7.0.1xx, `generateImage` repite la llamada cuando vuelve
          // sin imagen, salvo que el modelo diga `isRetryable: false`. Aquí no
          // se repite nunca: un bloqueo se volvería a cobrar, y una respuesta
          // vacía sin señal la reintenta el usuario, no el adapter (el job
          // tampoco reintenta, ADR-025). Los errores de API sí siguen con los
          // reintentos del SDK, como antes.
          return result.images.length === 0 ? { ...result, isRetryable: false } : result;
        },
      },
    });

    try {
      const result = await generateImage({
        model,
        prompt,
        ...imageCallOptions(this.provider, this.modelName, request.aspectRatio),
        ...(this.options.maxRetries !== undefined ? { maxRetries: this.options.maxRetries } : {}),
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      });

      return {
        kind: "image",
        data: result.image.uint8Array,
        mediaType: result.image.mediaType,
        usage: result.usage,
        providerRaw: {
          usage: result.usage,
          // El del modelo, no el de `generateImage`: al juntar llamadas, el SDK
          // solo conserva `images` de cada proveedor, y se perdería, p. ej.,
          // el costo en dólares que reporta OpenRouter.
          providerMetadata: crudo.providerMetadata ?? result.providerMetadata,
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
        (error.statusCode === 400 || error.statusCode === 403) &&
        BLOCKED_BODY.test(error.responseBody ?? error.message)
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
