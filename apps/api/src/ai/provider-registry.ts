import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createProviderRegistry, type LanguageModel } from "ai";

// Capa de proveedor de ADR-004: los modelos se nombran "proveedor:modelo"
// (ej. "google:gemini-3.5-flash") y se resuelven contra un registry. Hoy el
// default viene de la env var AI_MODEL (palanca del operador); un futuro
// selector por chat solo tendría que pasar su model id a resolveModel —
// nada más de esta capa cambia.

type RegistrableProvider = Parameters<typeof createProviderRegistry>[0][string];

interface ProviderDescriptor {
  /** Env var que porta la API key; sin ella el proveedor no se registra. */
  envKey: string;
  /** Env var opcional para sobreescribir la base URL (proveedores OpenAI-compatible). */
  baseUrlEnvKey?: string;
  defaultBaseUrl?: string;
  create: (apiKey: string, baseUrl?: string) => RegistrableProvider;
}

// Fuente única de verdad del inventario de proveedores. Registro, validación
// de env (env.ts) y suite cultural derivan de esta tabla: agregar un
// proveedor es agregar una fila aquí (+ su key en el schema de env.ts).
export const PROVIDERS = {
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    create: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    create: (apiKey) => createOpenAI({ apiKey }),
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    create: (apiKey) => createAnthropic({ apiKey }),
  },
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    create: (apiKey) => createDeepSeek({ apiKey }),
  },
  minimax: {
    envKey: "MINIMAX_API_KEY",
    baseUrlEnvKey: "MINIMAX_BASE_URL",
    defaultBaseUrl: "https://api.minimax.io/v1",
    create: (apiKey, baseURL) =>
      createOpenAICompatible({ name: "minimax", baseURL: baseURL!, apiKey }),
  },
  kimi: {
    envKey: "KIMI_API_KEY",
    baseUrlEnvKey: "KIMI_BASE_URL",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    create: (apiKey, baseURL) =>
      createOpenAICompatible({ name: "kimi", baseURL: baseURL!, apiKey }),
  },
} as const satisfies Record<string, ProviderDescriptor>;

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const DEFAULT_MODEL_ID = "google:gemini-3.5-flash";

export type EnvSource = Record<string, string | undefined>;
export type ModelResolver = (modelId?: string) => LanguageModel;

/** Valida formato "proveedor:modelo" contra la tabla; error claro si no cumple. */
export function parseModelId(id: string): { provider: ProviderId; model: string } {
  const separatorIndex = id.indexOf(":");
  const provider = separatorIndex === -1 ? "" : id.slice(0, separatorIndex);
  const model = separatorIndex === -1 ? "" : id.slice(separatorIndex + 1);
  if (!Object.hasOwn(PROVIDERS, provider)) {
    throw new Error(
      `Model id "${id}" must use "provider:model" format with one of: ${PROVIDER_IDS.join(", ")}.`,
    );
  }
  if (!model) {
    throw new Error(`Model id "${id}" is missing the model name after ":".`);
  }
  return { provider: provider as ProviderId, model };
}

// Función pura (recibe el entorno como dato) para poder testearla sin env real.
export function createModelResolver(source: EnvSource, defaultModelId: string): ModelResolver {
  const providers: Partial<Record<ProviderId, RegistrableProvider>> = {};
  for (const id of PROVIDER_IDS) {
    const descriptor = PROVIDERS[id] as ProviderDescriptor;
    const apiKey = source[descriptor.envKey];
    if (!apiKey) continue;
    const baseUrl = descriptor.baseUrlEnvKey
      ? (source[descriptor.baseUrlEnvKey] ?? descriptor.defaultBaseUrl)
      : undefined;
    providers[id] = descriptor.create(apiKey, baseUrl);
  }

  const registry = createProviderRegistry(providers as Record<string, RegistrableProvider>);

  return (modelId?: string): LanguageModel => {
    const id = modelId ?? defaultModelId;
    const { provider } = parseModelId(id);
    if (!Object.hasOwn(providers, provider)) {
      throw new Error(
        `Cannot resolve model id "${id}": provider "${provider}" has no API key configured ` +
          `(${PROVIDERS[provider].envKey}). Configured providers: ${Object.keys(providers).join(", ") || "none"}.`,
      );
    }
    return registry.languageModel(id as `${string}:${string}`);
  };
}
