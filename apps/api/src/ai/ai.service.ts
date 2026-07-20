import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { env } from "../env.js";
import { createModelResolver, type ModelResolver } from "./provider-registry.js";

// Fachada inyectable sobre el registry (ADR-004): el resto de la app pide
// modelos aquí y nunca importa un proveedor concreto.
@Injectable()
export class AiService {
  private readonly resolver: ModelResolver = createModelResolver({
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    minimaxApiKey: env.MINIMAX_API_KEY,
    minimaxBaseUrl: env.MINIMAX_BASE_URL,
    defaultModelId: env.AI_MODEL,
  });

  resolveModel(modelId?: string): LanguageModel {
    return this.resolver(modelId);
  }
}
