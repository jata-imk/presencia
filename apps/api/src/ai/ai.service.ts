import type { LanguageModelV4 } from "@ai-sdk/provider";
import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { env } from "../env.js";
import { createFallbackChain, parseSimulateDown, type FallbackAttempt } from "./fallback.js";
import {
  createModelResolver,
  formatModelEntry,
  MODEL_BY_TASK,
  parseModelChain,
  type ModelEntry,
  type ModelResolver,
  type ProviderId,
  type ReasoningLevel,
  type RoutedTaskKind,
} from "./provider-registry.js";

/**
 * Un modelo listo para UNA llamada: la cadena de respaldo (F10.7) ya armada,
 * cada eslabón con su esfuerzo pegado.
 *
 * La identidad (`id`, `provider`, `modelName`, `reasoning`) es la del modelo
 * que corrió: antes de la llamada, el principal; después, el que respondió.
 * Así la telemetría (`ai_usage_events`) nunca reporta un modelo distinto del
 * que de verdad produjo el texto, aunque haya caído a un respaldo. Por eso
 * NO se reutiliza entre llamadas: cada una pide el suyo a `AiService`.
 */
export interface ResolvedModel {
  model: LanguageModel;
  /** "proveedor:modelo" del que corrió (sin el `@esfuerzo`). */
  readonly id: string;
  readonly provider: ProviderId;
  readonly modelName: string;
  readonly reasoning?: ReasoningLevel;
  /** El principal pedido, si respondió un respaldo; null si respondió el principal. */
  readonly fallbackFrom: string | null;
  /** Los intentos que fallaron antes del que respondió. */
  readonly attempts: readonly FallbackAttempt[];
}

// Fachada inyectable sobre el registry (ADR-004): el resto de la app pide
// modelos aquí y nunca importa un proveedor concreto.
@Injectable()
export class AiService {
  // process.env ya pasó la validación de env.ts al boot; el registry lee las
  // keys por nombre desde la tabla PROVIDERS (fuente única, ADR-004).
  private readonly resolver: ModelResolver = createModelResolver(process.env, env.AI_MODEL);
  private readonly simulateDown = parseSimulateDown(env.AI_FALLBACK_SIMULATE);

  resolve(modelChain?: string): ResolvedModel {
    const entries = parseModelChain(modelChain ?? env.AI_MODEL);
    const chain = createFallbackChain(
      entries.map((entry) => ({
        entry,
        // Todos los proveedores del registry son del spec v4 desde F10.7 PR1.
        model: this.resolver(formatModelEntry(entry)) as LanguageModelV4,
      })),
      { simulateDown: this.simulateDown },
    );
    const principal = entries[0]!;
    const ran = (): ModelEntry => chain.ran;
    return {
      model: chain.model,
      get id() {
        return ran().id;
      },
      get provider() {
        return ran().provider;
      },
      get modelName() {
        return ran().model;
      },
      get reasoning() {
        return ran().reasoning;
      },
      get fallbackFrom() {
        return ran().id === principal.id ? null : principal.id;
      },
      get attempts() {
        return chain.attempts;
      },
    };
  }

  // Routing por tarea (F4.5, addendum ADR-004): el call site declara su
  // tarea explícitamente, nunca se infiere. MODEL_BY_TASK mapea la tarea a
  // un tier de env var; sin setear, cae a AI_MODEL vía resolve().
  resolveForTask(task: RoutedTaskKind): ResolvedModel {
    const envVar = MODEL_BY_TASK[task];
    return this.resolve(env[envVar]);
  }
}
