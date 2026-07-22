import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { env } from "../env.js";
import { createModelResolver, type ModelResolver } from "./provider-registry.js";

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
}
