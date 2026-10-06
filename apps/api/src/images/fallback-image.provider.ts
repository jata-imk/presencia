import {
  AttemptTimeoutError,
  describeError,
  FallbackExhaustedError,
  isFallbackError,
  RETRIES_PER_MODEL,
  simulatedOutage,
  statusOf,
  timedOutWith,
  type FallbackAttempt,
} from "../ai/fallback.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./image-provider.js";

// La cadena de respaldo de imagen (F10.7, ADR-025): el generador principal y
// sus respaldos en el orden de AI_MODEL_IMAGE. Misma regla —y mismo código—
// que la de texto (ai/fallback.ts): solo cae al siguiente si el proveedor se
// CAE (5xx, 408, 409, 429, sin saldo, red, timeout). Un bloqueo de contenido
// nunca cae al siguiente: probar con otro generador una imagen que uno se
// negó a dibujar sería esquivar la moderación.

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
    const simulateDown = new Set(this.options.simulateDown ?? []);
    const attemptCap = this.options.attemptTimeoutMs ?? IMAGE_ATTEMPT_TIMEOUT_MS;
    const deadline = Date.now() + (this.options.budgetMs ?? IMAGE_CHAIN_BUDGET_MS);
    const retryDelayMs = this.options.retryDelayMs ?? RETRY_DELAY_MS;
    const principal = `${this.provider}:${this.modelName}`;
    const attempts: FallbackAttempt[] = [];
    let lastError: unknown;

    chain: for (const link of this.links) {
      const id = `${link.provider}:${link.modelName}`;
      for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
        // Tras un timeout no se reintenta el mismo: ya se esperó el plazo entero.
        if (attempt > 0 && lastError instanceof AttemptTimeoutError) break;
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        const remaining = deadline - Date.now();
        if (remaining < MIN_ATTEMPT_MS) break chain;
        const timeoutMs = Math.min(attemptCap, remaining);
        const controller = new AbortController();
        const timeout = new AttemptTimeoutError(timeoutMs);
        const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
        try {
          if (simulateDown.has(link.provider)) throw simulatedOutage(link.provider);
          const result = await link.generate({ ...request, abortSignal: controller.signal });
          // Un bloqueo también vuelve aquí: nunca pasa al siguiente.
          return {
            ...result,
            ran: {
              provider: link.provider,
              modelName: link.modelName,
              fallbackFrom: id === principal ? null : principal,
              attempts,
            },
          };
        } catch (error) {
          const timedOut = controller.signal.aborted && controller.signal.reason === timeout;
          const cause = timedOutWith(timedOut, error) ? timeout : error;
          if (!isFallbackError(cause)) {
            // Un error que no es caída (400, key mala) se lanza tal cual, pero
            // con lo que pasó antes: sin eso, el log diría que falló el
            // principal cuando el que falló fue el respaldo.
            if (attempts.length === 0) throw cause;
            throw new Error(
              `${id} falló tras caer el principal (${attempts.map((a) => `${a.id}: ${String(a.status ?? "sin status")}`).join(", ")}): ${describeError(error)}`,
              // Aquí `cause` es `error`: un timeout siempre es caída y no llega.
              { cause: error },
            );
          }
          attempts.push({ id, status: statusOf(cause), error: describeError(cause) });
          lastError = cause;
        } finally {
          clearTimeout(timer);
        }
      }
    }
    throw new FallbackExhaustedError(attempts, { cause: lastError });
  }
}
