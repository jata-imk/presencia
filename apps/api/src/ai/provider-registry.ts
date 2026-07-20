import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createProviderRegistry, type LanguageModel } from "ai";

// Capa de proveedor de ADR-004: los modelos se nombran "proveedor:modelo"
// (ej. "google:gemini-3.5-flash") y se resuelven contra un registry. Hoy el
// default viene de la env var AI_MODEL (palanca del operador); un futuro
// selector por chat solo tendría que pasar su model id a resolveModel —
// nada más de esta capa cambia.

export interface AiProviderConfig {
  googleApiKey: string;
  openaiApiKey?: string;
  minimaxApiKey?: string;
  minimaxBaseUrl: string;
  defaultModelId: string;
}

export type ModelResolver = (modelId?: string) => LanguageModel;

// Función pura (sin leer env) para poder testearla sin entorno completo.
export function createModelResolver(config: AiProviderConfig): ModelResolver {
  const providers: Parameters<typeof createProviderRegistry>[0] = {
    google: createGoogleGenerativeAI({ apiKey: config.googleApiKey }),
  };
  if (config.openaiApiKey) {
    providers.openai = createOpenAI({ apiKey: config.openaiApiKey });
  }
  if (config.minimaxApiKey) {
    providers.minimax = createOpenAICompatible({
      name: "minimax",
      baseURL: config.minimaxBaseUrl,
      apiKey: config.minimaxApiKey,
    });
  }

  const registry = createProviderRegistry(providers);

  return (modelId?: string): LanguageModel => {
    const id = modelId ?? config.defaultModelId;
    const separatorIndex = id.indexOf(":");
    const provider = separatorIndex === -1 ? "" : id.slice(0, separatorIndex);
    if (!(provider in providers)) {
      throw new Error(
        `Cannot resolve model id "${id}": provider "${provider}" is not configured. ` +
          `Available providers: ${Object.keys(providers).join(", ")}. ` +
          `Use "provider:model" ids and check the provider's API key env var.`,
      );
    }
    return registry.languageModel(id as `${string}:${string}`);
  };
}
