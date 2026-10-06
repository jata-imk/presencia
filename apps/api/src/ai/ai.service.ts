import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { env } from "../env.js";
import {
  createModelResolver,
  MODEL_BY_TASK,
  parseModelEntry,
  type ModelResolver,
  type ProviderId,
  type ReasoningLevel,
  type RoutedTaskKind,
} from "./provider-registry.js";

export interface ResolvedModel {
  /** Ya trae pegado su esfuerzo de razonamiento, si la entrada lo pedía. */
  model: LanguageModel;
  /** Id completo "proveedor:modelo" que se resolvió — nunca se releé env.AI_MODEL por separado. */
  id: string;
  provider: ProviderId;
  modelName: string;
  /** El `@esfuerzo` de la entrada del `.env`; sin él, el default del proveedor. */
  reasoning?: ReasoningLevel;
}

// Fachada inyectable sobre el registry (ADR-004): el resto de la app pide
// modelos aquí y nunca importa un proveedor concreto.
@Injectable()
export class AiService {
  // process.env ya pasó la validación de env.ts al boot; el registry lee las
  // keys por nombre desde la tabla PROVIDERS (fuente única, ADR-004).
  private readonly resolver: ModelResolver = createModelResolver(process.env, env.AI_MODEL);

  // F4.5: devuelve el modelo junto con su identidad ya parseada — así la
  // telemetría (ai_usage_events) nunca puede reportar un proveedor/modelo
  // distinto del que de verdad ejecutó la llamada.
  resolve(modelEntry?: string): ResolvedModel {
    // Mismo fallback que usa el resolver por dentro (env.AI_MODEL) — así la
    // identidad reportada nunca puede desalinearse del modelo que corrió.
    const {
      id,
      provider,
      model: modelName,
      reasoning,
    } = parseModelEntry(modelEntry ?? env.AI_MODEL);
    return {
      model: this.resolver(modelEntry),
      id,
      provider,
      modelName,
      ...(reasoning ? { reasoning } : {}),
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
