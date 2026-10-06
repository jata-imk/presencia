import { APICallError } from "@ai-sdk/provider";
import { isFallbackError, type FallbackAttempt } from "../ai/fallback.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./image-provider.js";

// La cadena de respaldo de imagen (F10.7, ADR-025): el generador principal y
// sus respaldos en el orden de AI_MODEL_IMAGE. Misma regla que la de texto
// (ai/fallback.ts): solo cae al siguiente si el proveedor se CAE (5xx, 408,
// 409, 429, sin saldo, red, timeout). Un bloqueo de contenido nunca cae al
// siguiente: probar con otro generador una imagen que uno se negó a dibujar
// sería esquivar la moderación.

/**
 * Por intento. Lo más lento medido es ~39 s (gpt-image-2) y un caso aislado
 * de Gemini a 131 s, que es justo lo que este plazo corta. Tres intentos caben
 * en los 240 s del trabajo (IMAGE_JOB_EXPIRE_SECONDS).
 */
export const IMAGE_ATTEMPT_TIMEOUT_MS = 70_000;
const RETRIES_PER_MODEL = 1;
const RETRY_DELAY_MS = 1_000;

class ImageAttemptTimeoutError extends Error {
  constructor(ms: number) {
    super(`El generador no respondió en ${String(ms / 1000)} s`);
    this.name = "ImageAttemptTimeoutError";
  }
}

export interface FallbackImageOptions {
  /** Proveedores que se fingen caídos (503). Solo dev: lo rechaza `env.ts` en producción. */
  simulateDown?: readonly string[];
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
}

function statusOf(error: unknown): number | null {
  return APICallError.isInstance(error) ? (error.statusCode ?? null) : null;
}

function describe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
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
    const timeoutMs = this.options.attemptTimeoutMs ?? IMAGE_ATTEMPT_TIMEOUT_MS;
    const retryDelayMs = this.options.retryDelayMs ?? RETRY_DELAY_MS;
    const principal = `${this.provider}:${this.modelName}`;
    const attempts: FallbackAttempt[] = [];
    let lastError: unknown;

    for (const link of this.links) {
      const id = `${link.provider}:${link.modelName}`;
      for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
        // Tras un timeout no se reintenta el mismo: ya se esperó el plazo entero.
        if (attempt > 0 && lastError instanceof ImageAttemptTimeoutError) break;
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        const controller = new AbortController();
        const timeout = new ImageAttemptTimeoutError(timeoutMs);
        const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
        try {
          if (simulateDown.has(link.provider)) {
            throw new APICallError({
              message: `Caída simulada de ${link.provider} (AI_FALLBACK_SIMULATE)`,
              url: "simulado",
              requestBodyValues: {},
              statusCode: 503,
              isRetryable: true,
            });
          }
          const result = await link.generate({ ...request, abortSignal: controller.signal });
          // Un bloqueo también se devuelve aquí: nunca pasa al siguiente.
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
          const cause = controller.signal.reason === timeout ? timeout : error;
          if (!isFallbackError(cause) && !(cause instanceof ImageAttemptTimeoutError)) throw cause;
          attempts.push({ id, status: statusOf(cause), error: describe(cause) });
          lastError = cause;
        } finally {
          clearTimeout(timer);
        }
      }
    }
    throw new Error(
      `Todos los generadores fallaron: ${attempts.map((a) => `${a.id} (${String(a.status ?? "sin status")}: ${a.error})`).join("; ")}`,
      { cause: lastError },
    );
  }
}
