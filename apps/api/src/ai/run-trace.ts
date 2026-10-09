// La traza de un turno de chat (F10.8.1, ADR-026): un renglón por paso de
// modelo y por tool, en el orden en que pasaron. Puro: junta lo que le cuentan
// los callbacks de `streamText` y no toca la base; `AiUsageService` la guarda
// al final del turno, terminado o abortado.

export type RunStepKind = "model" | "tool";
export type RunStepStatus = "ok" | "error" | "aborted";

export interface RunStep {
  /** El paso del modelo al que pertenece (las tools de un paso comparten su índice). */
  stepIndex: number;
  kind: RunStepKind;
  /** `proveedor:modelo` que corrió, o el nombre de la tool. */
  name: string;
  status: RunStepStatus;
  startedAt: Date;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  error?: string | null;
}

/** Lo que importa de `onStepStart`. */
interface StepStart {
  stepNumber: number;
  provider: string;
  modelId: string;
}

/** Lo que importa de `onStepFinish`. */
interface StepFinish {
  stepNumber: number;
  model: { provider: string; modelId: string };
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
  };
  performance: { responseTimeMs: number };
  finishReason: string;
}

/** Lo que importa de `experimental_onToolCallFinish`. */
interface ToolFinish {
  toolCall: { toolName: string };
  toolExecutionMs: number;
  toolOutput: { type: string; error?: unknown };
}

/** Lo que cabe de un error en la traza: el mensaje, nunca el objeto entero. */
const MAX_ERROR_CHARS = 300;

export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_ERROR_CHARS);
}

/**
 * El proveedor que reporta el SDK trae el sufijo de la API ("openai.responses",
 * "google.generative-ai"); la traza usa el mismo id que `ai_usage_events` y
 * el `.env` ("openai:gpt-6-luna").
 */
function modelName(provider: string, modelId: string): string {
  return `${provider.split(".")[0]!}:${modelId}`;
}

export class RunTrace {
  readonly steps: RunStep[] = [];
  /** El paso de modelo que empezó y todavía no termina. */
  private open: { stepIndex: number; name: string; startedAt: number } | null = null;
  private claimed = false;

  constructor(readonly runId: string) {}

  stepStarted(event: StepStart, now = Date.now()): void {
    this.open = {
      stepIndex: event.stepNumber,
      name: modelName(event.provider, event.modelId),
      startedAt: now,
    };
  }

  stepFinished(event: StepFinish, now = Date.now()): void {
    const startedAt = this.open?.stepIndex === event.stepNumber ? this.open.startedAt : now;
    this.open = null;
    this.steps.push({
      stepIndex: event.stepNumber,
      kind: "model",
      name: modelName(event.model.provider, event.model.modelId),
      status: event.finishReason === "error" ? "error" : "ok",
      startedAt: new Date(startedAt),
      // Lo que esperó al modelo, sin las tools del paso (van en su renglón).
      durationMs: Math.round(event.performance.responseTimeMs),
      inputTokens: event.usage.inputTokens ?? null,
      outputTokens: event.usage.outputTokens ?? null,
      cachedInputTokens: event.usage.inputTokenDetails?.cacheReadTokens ?? null,
    });
  }

  toolFinished(event: ToolFinish, now = Date.now()): void {
    const failed = event.toolOutput.type === "tool-error";
    this.steps.push({
      stepIndex: this.open?.stepIndex ?? this.lastIndex(),
      kind: "tool",
      name: event.toolCall.toolName,
      status: failed ? "error" : "ok",
      startedAt: new Date(now - event.toolExecutionMs),
      durationMs: Math.round(event.toolExecutionMs),
      error: failed ? errorText(event.toolOutput.error) : null,
    });
  }

  /**
   * Cierra el paso que quedó a medias: `aborted` si el creator cortó el turno,
   * `error` si el stream falló. Sin paso abierto (el corte cayó entre pasos) no
   * agrega nada.
   */
  close(status: Exclude<RunStepStatus, "ok">, error?: unknown, now = Date.now()): void {
    if (!this.open) return;
    this.steps.push({
      stepIndex: this.open.stepIndex,
      kind: "model",
      name: this.open.name,
      status,
      startedAt: new Date(this.open.startedAt),
      durationMs: now - this.open.startedAt,
      error: error === undefined ? null : errorText(error),
    });
    this.open = null;
  }

  /**
   * `true` solo la primera vez: la traza se guarda una vez aunque dos caminos
   * lo pidan. Un turno cortado pasa por `onAbort` del stream y, después, por
   * `onEnd` del puente a la respuesta, que también falla al leer el usage.
   */
  claim(): boolean {
    if (this.claimed) return false;
    this.claimed = true;
    return true;
  }

  private lastIndex(): number {
    return this.steps.reduce((max, step) => Math.max(max, step.stepIndex), 0);
  }
}
