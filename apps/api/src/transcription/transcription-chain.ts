import { transcribe } from "ai";
import { parseSimulateDown, runFallbackChain, type ChainRan } from "../ai/fallback.js";
import {
  createTranscriptionModelResolver,
  parseModelChain,
  type EnvSource,
} from "../ai/provider-registry.js";

// La cadena de transcripción (F11, ADR-030): Groq y OpenAI de respaldo, en el
// orden de AI_MODEL_TRANSCRIBE. Misma regla —y mismo código,
// `runFallbackChain`— que la de imagen (ai/fallback.ts): solo cae al
// siguiente si el proveedor se CAE (5xx, 408, 409, 429, sin saldo, red,
// timeout). Un 400 (un audio que el proveedor no lee) o una key mala se
// lanzan tal cual. No `createFallbackChain`: aquel envuelve un
// `LanguageModelV4` (stream, primera salida), y transcribir es una sola
// llamada sin stream, como dibujar una imagen.

/**
 * Lo más que se le espera a un intento. Groq tardó 1.6 s con una nota de
 * 150 s en el bake-off y OpenAI 3.6 s; una nota de 10 min no debería pasar de
 * ~15 s. Lo que corta es un proveedor colgado, con el creator mirando el draft.
 */
export const TRANSCRIPTION_ATTEMPT_TIMEOUT_MS = 30_000;
/** La cadena entera: cada intento recibe lo que quede, con el tope de arriba. */
export const TRANSCRIPTION_CHAIN_BUDGET_MS = 60_000;
/** Con menos de esto no vale la pena empezar otro intento. */
const MIN_ATTEMPT_MS = 5_000;
const RETRY_DELAY_MS = 1_000;

/** Un eslabón: un modelo que transcribe. El real llama al AI SDK; los tests, uno falso. */
export interface TranscriptionLink {
  provider: string;
  modelName: string;
  run(audio: Uint8Array, abortSignal: AbortSignal): Promise<{ text: string; raw: unknown }>;
}

export type TranscriptionRan = ChainRan;

export interface TranscriptionChainResult {
  text: string;
  raw: unknown;
  ran: TranscriptionRan;
}

export interface TranscriptionChainOptions {
  /** Proveedores que se fingen caídos (503). Solo dev: lo rechaza `env.ts` en producción. */
  simulateDown?: readonly string[];
  attemptTimeoutMs?: number;
  budgetMs?: number;
  retryDelayMs?: number;
}

export class TranscriptionChain {
  constructor(
    private readonly links: readonly TranscriptionLink[],
    private readonly options: TranscriptionChainOptions = {},
  ) {
    if (links.length === 0) {
      throw new Error("Una cadena de transcripción necesita al menos un modelo.");
    }
  }

  /**
   * `signal` es el detener del creator: corta la llamada en curso (y la pausa
   * antes de un reintento) y no pasa al siguiente: lanza el aborto tal cual.
   */
  async transcribe(audio: Uint8Array, signal?: AbortSignal): Promise<TranscriptionChainResult> {
    const { result, ran } = await runFallbackChain(
      this.links,
      (link, abortSignal) => link.run(audio, abortSignal),
      {
        simulateDown: this.options.simulateDown,
        attemptTimeoutMs: this.options.attemptTimeoutMs ?? TRANSCRIPTION_ATTEMPT_TIMEOUT_MS,
        budgetMs: this.options.budgetMs ?? TRANSCRIPTION_CHAIN_BUDGET_MS,
        minAttemptMs: MIN_ATTEMPT_MS,
        retryDelayMs: this.options.retryDelayMs ?? RETRY_DELAY_MS,
        signal,
      },
    );
    return { ...result, ran };
  }
}

/**
 * La cadena real desde el `.env`. Cada eslabón sin reintentos propios del SDK:
 * reintenta la cadena. El texto sale tal cual lo devuelve el modelo, sin
 * filtro de silencio ni idioma fijo (bake-off: fijar `es` daba el mismo texto).
 */
export function buildTranscriptionChain(
  chain: string,
  source: EnvSource,
  simulate: string | undefined,
): TranscriptionChain {
  const resolve = createTranscriptionModelResolver(source);
  const links = parseModelChain(chain).map(({ id, provider, model }): TranscriptionLink => {
    const resolved = resolve(id);
    return {
      provider,
      modelName: model,
      run: async (audio, abortSignal) => {
        const result = await transcribe({ model: resolved, audio, maxRetries: 0, abortSignal });
        return {
          text: result.text,
          raw: {
            language: result.language ?? null,
            durationInSeconds: result.durationInSeconds ?? null,
            warnings: result.warnings,
          },
        };
      },
    };
  });
  return new TranscriptionChain(links, { simulateDown: parseSimulateDown(simulate) });
}
