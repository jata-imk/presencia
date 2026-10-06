import type { ImageAspectRatio } from "@presencia/shared";
import type { ImageModelUsage } from "ai";
import type { FallbackAttempt } from "../ai/fallback.js";

// El contrato del generador de imágenes (F10, ADR-025). Mismo patrón que
// PublishingProvider (ADR-009): la app habla con esta interfaz, y qué
// proveedor dibuja detrás es una variable de entorno.
//
// Una llamada = una imagen. Las dos variantes que pide la card son dos
// llamadas, no `n: 2`: Gemini no acepta `n`, y aunque lo aceptara, cada
// imagen se cobra y se guarda por separado — si una de las dos falla, la otra
// no tiene por qué perderse con ella.

// Las proporciones viven en @presencia/shared: la card las ofrece como chips.
export type { ImageAspectRatio };

export interface ReferenceImage {
  data: Uint8Array;
  mediaType: string;
}

export interface ImageRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  /** Editar en vez de generar: la imagen de partida, y el prompt es la instrucción. */
  reference?: ReferenceImage;
  /** El plazo por intento de la cadena de respaldo (F10.7). */
  abortSignal?: AbortSignal;
}

/**
 * Qué generador dibujó de verdad (F10.7). Lo pone la cadena de respaldo; un
 * generador suelto no lo trae y su identidad es la del provider.
 */
export interface ImageRun {
  provider: string;
  modelName: string;
  /** El principal pedido, si respondió un respaldo; null si respondió el principal. */
  fallbackFrom: string | null;
  attempts: readonly FallbackAttempt[];
}

export type ImageResult = (
  | {
      kind: "image";
      data: Uint8Array;
      mediaType: string;
      usage: ImageModelUsage;
      /** Metadata y warnings del proveedor, SIN los bytes: va a `ai_usage_events`. */
      providerRaw: unknown;
    }
  | {
      /**
       * El proveedor se negó a dibujar (personas reales, marcas, contenido
       * sensible). No es un error del sistema: no se reintenta, no se cobra, y
       * al usuario se le dice qué pedir distinto.
       */
      kind: "blocked";
      /**
       * Gemini cobra los tokens de entrada aunque no dibuje: si el proveedor
       * los reportó, van a la telemetría. OpenAI rechaza antes, sin usage.
       */
      usage?: ImageModelUsage;
      providerRaw: unknown;
    }
) & { ran?: ImageRun };

export interface ImageProvider {
  /** Identidad para la telemetría: la misma forma que `ResolvedModel`. */
  readonly provider: string;
  readonly modelName: string;
  /**
   * Lanza ante fallas del sistema (red, 5xx, key inválida). Un bloqueo por
   * contenido NO lanza: vuelve como `kind: "blocked"`.
   */
  generate(request: ImageRequest): Promise<ImageResult>;
}

/**
 * F10.7: los generadores de la lista AI_MODEL_IMAGE, en orden. El generador N
 * (`generators[N - 1]`) es una cadena de respaldo que arranca en el N-ésimo y
 * sigue con los demás: "Probar con otro generador" elige con cuál empezar, y
 * si ese está caído, igual responde alguno.
 */
export interface ImageProviders {
  generators: ImageProvider[];
}

export const IMAGE_PROVIDERS = Symbol("IMAGE_PROVIDERS");
