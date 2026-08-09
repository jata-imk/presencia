import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { env } from "../env.js";
import {
  createModelResolver,
  parseModelId,
  type ModelResolver,
  type ProviderId,
} from "./provider-registry.js";

export interface ResolvedModel {
  model: LanguageModel;
  /** Id completo "proveedor:modelo" que se resolvió — nunca se releé env.AI_MODEL por separado. */
  id: string;
  provider: ProviderId;
  modelName: string;
}

// Fachada inyectable sobre el registry (ADR-004): el resto de la app pide
// modelos aquí y nunca importa un proveedor concreto.
@Injectable()
export class AiService {
  // process.env ya pasó la validación de env.ts al boot; el registry lee las
  // keys por nombre desde la tabla PROVIDERS (fuente única, ADR-004).
  private readonly resolver: ModelResolver = createModelResolver(process.env, env.AI_MODEL);

  resolveModel(modelId?: string): LanguageModel {
    return this.resolver(modelId);
  }

  // F4.5: devuelve el modelo junto con su identidad ya parseada — así la
  // telemetría (ai_usage_events) nunca puede reportar un proveedor/modelo
  // distinto del que de verdad ejecutó la llamada.
  resolve(modelId?: string): ResolvedModel {
    // Mismo fallback que usa el resolver por dentro (env.AI_MODEL) — así la
    // identidad reportada nunca puede desalinearse del modelo que corrió.
    const id = modelId ?? env.AI_MODEL;
    const { provider, model: modelName } = parseModelId(id);
    return { model: this.resolver(modelId), id, provider, modelName };
  }
}
