import { runFallbackChain } from "../ai/fallback.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./image-provider.js";

// La cadena de respaldo de imagen (F10.7, ADR-025): el generador principal y
// sus respaldos en el orden de AI_MODEL_IMAGE. Misma regla —y mismo código,
// `runFallbackChain`— que la de texto (ai/fallback.ts): solo cae al siguiente
// si el proveedor se CAE (5xx, 408, 409, 429, sin saldo, red, timeout). Un
// bloqueo de contenido nunca cae al siguiente: probar con otro generador una
// imagen que uno se negó a dibujar sería esquivar la moderación.

/**
 * Lo más que se le espera a un intento. gpt-image puede tardar ~2 min en una
 * edición (images.jobs.ts), así que el plazo no puede ser mucho menor; lo que
 * corta es un generador colgado (Gemini llegó a 131 s).
 */
export const IMAGE_ATTEMPT_TIMEOUT_MS = 120_000;
/**
 * Lo más que se le espera a la cadena entera. Por debajo de los 240 s del
 * trabajo (IMAGE_JOB_EXPIRE_SECONDS), con margen para guardar la imagen: una
 * imagen que llega cuando el trabajo ya venció se paga y nunca se muestra.
 * Cada intento recibe lo que quede, con el tope de arriba.
 */
export const IMAGE_CHAIN_BUDGET_MS = 220_000;
/** Con menos de esto no vale la pena empezar otro intento: no alcanzaría a dibujar. */
const MIN_ATTEMPT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;

export interface FallbackImageOptions {
  /** Proveedores que se fingen caídos (503). Solo dev: lo rechaza `env.ts` en producción. */
  simulateDown?: readonly string[];
  attemptTimeoutMs?: number;
  budgetMs?: number;
  retryDelayMs?: number;
}

export class FallbackImageProvider implements ImageProvider {
  /** La identidad del principal; la de cada imagen viaja en `result.ran`. */
  readonly provider: string;
  readonly modelName: string;

  constructor(
    private readonly links: readonly ImageProvider[],
    private readonly options: FallbackImageOptions = {},
  ) {
    const [principal] = links;
    if (!principal) throw new Error("Una cadena de generadores necesita al menos uno.");
    this.provider = principal.provider;
    this.modelName = principal.modelName;
  }

  async generate(request: ImageRequest): Promise<ImageResult> {
    // Un bloqueo también vuelve como resultado: nunca pasa al siguiente.
    const { result, ran } = await runFallbackChain(
      this.links,
      (link, abortSignal) => link.generate({ ...request, abortSignal }),
      {
        simulateDown: this.options.simulateDown,
        attemptTimeoutMs: this.options.attemptTimeoutMs ?? IMAGE_ATTEMPT_TIMEOUT_MS,
        budgetMs: this.options.budgetMs ?? IMAGE_CHAIN_BUDGET_MS,
        minAttemptMs: MIN_ATTEMPT_MS,
        retryDelayMs: this.options.retryDelayMs ?? RETRY_DELAY_MS,
      },
    );
    return { ...result, ran };
  }
}
