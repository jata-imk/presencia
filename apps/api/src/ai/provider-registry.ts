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

export const DEFAULT_MODEL_ID = "google:gemini-3.6-flash";

// Tareas que consumen un modelo (F4.5, addendum ADR-004). Hoy solo "chat"
// tiene call site (chat.service.ts); las demás existen porque el enum de
// Postgres de ai_usage_events es la parte cara de cambiar después — F5-F7
// les agregan call site sin volver a tocar el schema. MODEL_BY_TASK (PR
// feat/f45-model-routing) mapea cada una a un tier de env var.
export const AI_TASK_KINDS = [
  "chat",
  "chat_title",
  "history_compaction",
  "post_adapt",
  "voice_distill",
  "analytics_narration",
] as const;
export type AiTaskKind = (typeof AI_TASK_KINDS)[number];

// Tiers de modelo (F4.5, addendum ADR-004): AI_MODEL_CHAT es el moat
// cultural, no se abarata. AI_MODEL_UTILITY es modelo chico (titulares,
// compactar historial, narrar analíticas). AI_MODEL_ADAPT es creativo
// acotado / utility pesado (adaptar posts entre redes, destilar ejemplos a
// voz de marca). Cada tier sin setear cae a AI_MODEL (env.ts).
export const MODEL_TIER_ENV_VARS = ["AI_MODEL_CHAT", "AI_MODEL_UTILITY", "AI_MODEL_ADAPT"] as const;
export type ModelTierEnvVar = (typeof MODEL_TIER_ENV_VARS)[number];

// El call site declara su tarea (AiService.resolveForTask); nunca se infiere
// con un clasificador previo — eso sería meter un LLM para decidir qué LLM
// usar, pagado en latencia justo en el primer token.
export const MODEL_BY_TASK: Record<AiTaskKind, ModelTierEnvVar> = {
  chat: "AI_MODEL_CHAT",
  chat_title: "AI_MODEL_UTILITY",
  history_compaction: "AI_MODEL_UTILITY",
  post_adapt: "AI_MODEL_ADAPT",
  voice_distill: "AI_MODEL_ADAPT",
  analytics_narration: "AI_MODEL_UTILITY",
};

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
