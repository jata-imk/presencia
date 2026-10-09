import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { createProviderRegistry, wrapLanguageModel, type ImageModel, type LanguageModel } from "ai";
import { createOpenRouterImages, OPENROUTER_BASE_URL } from "./openrouter-images.js";

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
  /** Solo genera imágenes: no puede ir en una variable de modelo de texto (env.ts lo rechaza). */
  imageOnly?: boolean;
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
  // F10.7: Grok Imagine (ADR-025). Provider oficial del AI SDK; también tiene
  // texto (Grok), que nadie usa todavía.
  xai: {
    envKey: "XAI_API_KEY",
    create: (apiKey) => createXai({ apiKey }),
  },
  // F10.7: Muse (Meta) y MAI-Image (Microsoft) con una sola key. Adapter
  // propio y solo de imágenes: ver ai/openrouter-images.ts.
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    baseUrlEnvKey: "OPENROUTER_BASE_URL",
    defaultBaseUrl: OPENROUTER_BASE_URL,
    create: (apiKey, baseUrl) => createOpenRouterImages({ apiKey, baseUrl }),
    imageOnly: true,
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
  // F9.8: las dos llamadas de un refresco de tendencias (ADR-024). Van
  // separadas porque cuestan distinto: la búsqueda paga además un fee por
  // consulta (`ai_usage_events.search_queries`), la estructura solo tokens.
  "trends_search",
  "trends_structure",
  // F9.7: "Ver ejemplo de tu voz" en Configuración. Tarea propia y no `chat`:
  // no vive en una conversación, y mezclarla con los turnos ensuciaría
  // justo la métrica con la que se calibra el costo del chat.
  "voice_preview",
  // F10: generar una imagen desde cero y editar una a partir de otra (ADR-025).
  // Separadas porque la edición manda una imagen de entrada, que el proveedor
  // cobra aparte, y juntarlas escondería justo esa diferencia.
  "image_generate",
  "image_edit",
  // F10.8: la memoria entre chats. Indexar cada intercambio (un embedding de
  // documento) y buscar (uno de consulta). Separadas: el indexado corre en
  // cada turno y la búsqueda solo cuando el chat la pide.
  "memory_index",
  "memory_search",
] as const;
export type AiTaskKind = (typeof AI_TASK_KINDS)[number];

/** Las tareas que producen imágenes: no se enrutan por tier ni se cobran por tokens. */
export type ImageTaskKind = "image_generate" | "image_edit";

/**
 * F10.8: las de la memoria. Tampoco se enrutan por tier: piden un modelo de
 * embeddings (AI_MODEL_EMBEDDING), no uno de texto.
 */
export type MemoryTaskKind = "memory_index" | "memory_search";

/**
 * Las tareas que se enrutan por tier.
 *
 * `trends_search` queda fuera a propósito: no pide "un modelo", pide la
 * capacidad de buscar con grounding, y se resuelve con `AI_MODEL_TRENDS` y su
 * propio default (`DEFAULT_TRENDS_MODEL_ID`). Darle un tier sería dejar
 * abierta una llamada a `resolveForTask("trends_search")` que devuelve un
 * modelo sin búsqueda; excluida del tipo, esa llamada no compila.
 */
export type RoutedTaskKind = Exclude<AiTaskKind, "trends_search" | ImageTaskKind | MemoryTaskKind>;

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
export const MODEL_BY_TASK: Record<RoutedTaskKind, ModelTierEnvVar> = {
  chat: "AI_MODEL_CHAT",
  chat_title: "AI_MODEL_UTILITY",
  history_compaction: "AI_MODEL_UTILITY",
  post_adapt: "AI_MODEL_ADAPT",
  voice_distill: "AI_MODEL_ADAPT",
  analytics_narration: "AI_MODEL_UTILITY",
  trends_structure: "AI_MODEL_UTILITY",
  // El tier del chat y no utility: lo que el usuario está probando es si
  // SUENA a él, y eso lo decide el modelo que después le escribe los posts.
  // Un ejemplo con un modelo más barato mentiría sobre el resultado real.
  voice_preview: "AI_MODEL_CHAT",
};

/**
 * La búsqueda web con grounding, que hoy solo Google ofrece.
 *
 * Vive detrás de esta capa por la misma razón que los modelos (ADR-004): el
 * resto de la app no importa un proveedor concreto. Pero a diferencia de un
 * modelo, esto NO es intercambiable — la tool devuelve `groundingMetadata` con
 * las páginas que de verdad visitó, y de ese metadata sale la fuente citada de
 * cada tendencia. Un proveedor sin esa capacidad no daría "lo mismo más
 * barato": daría tendencias sin procedencia, que el producto define como algo
 * que no se publica.
 *
 * Por eso el llamador verifica que el modelo resuelto sea de Google antes de
 * usarla, en vez de degradar en silencio.
 */
export const GOOGLE_SEARCH_TOOL = google.tools.googleSearch({});

/** El proveedor que sabe hacer búsqueda con grounding. */
export const SEARCH_PROVIDER: ProviderId = "google";

/**
 * El modelo con el que se buscan tendencias cuando nadie configuró
 * AI_MODEL_TRENDS.
 *
 * Tiene su propio default en vez de caer a AI_MODEL —como sí hacen los tiers
 * de MODEL_BY_TASK— porque esta llamada no pide "un modelo", pide una
 * capacidad. Un despliegue que apunte AI_MODEL a OpenAI es una decisión
 * legítima sobre el chat que no dice nada sobre las tendencias, y heredarla
 * acá apagaría el módulo entero por un cambio que no tenía que ver con él.
 */
export const DEFAULT_TRENDS_MODEL_ID = "google:gemini-3.6-flash";

/**
 * El generador de imágenes cuando nadie configuró AI_MODEL_IMAGE (F10, ADR-025).
 *
 * Mismo criterio que `DEFAULT_TRENDS_MODEL_ID`: default propio y no AI_MODEL,
 * porque un modelo de texto no sabe hacer imágenes — heredar AI_MODEL sería
 * resolver algo que truena en la primera generación.
 */
export const DEFAULT_IMAGE_MODEL_ID = "google:gemini-3.1-flash-image";

/**
 * El modelo de embeddings de la memoria entre chats (F10.8), elegido con una
 * prueba de búsquedas en español sobre temas parecidos del mismo negocio
 * (12/12, empatado con text-embedding-3-large y más nuevo; ADR-004).
 *
 * SIN cadena de respaldo, a propósito: los vectores de dos modelos no se
 * pueden comparar, así que "caer al siguiente" mezclaría memorias que nunca
 * se encontrarían. Cambiar de modelo es re-indexar (`memoria:reindexar`).
 */
export const DEFAULT_EMBEDDING_MODEL_ID = "google:gemini-embedding-001";

/** Cuántas dimensiones guarda la memoria (≤ 2000: el tope del índice HNSW de pgvector). */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Los proveedores cuyos embeddings sabemos pedir a EMBEDDING_DIMENSIONS
 * (`embeddingOptions` en chat/memory.ts). Otro proveedor no tiene modelos de
 * embeddings o devuelve otro tamaño, y la columna `vector(1536)` lo rechazaría
 * en cada indexado: env.ts lo rechaza al boot.
 */
export const EMBEDDING_PROVIDERS = ["google", "openai"] as const;

export type EnvSource = Record<string, string | undefined>;
export type ModelResolver = (modelId?: string) => LanguageModel;
/** El modelo ya resuelto (nunca el id en texto que `ImageModel` también admite). */
export type ResolvedImageModel = Exclude<ImageModel, string>;
export type ImageModelResolver = (modelId: string) => ResolvedImageModel;

/**
 * El esfuerzo de razonamiento que se puede pedir con `@` (F10.7): el vocabulario
 * de la opción `reasoning` del AI SDK. Cada proveedor lo traduce a lo suyo
 * (OpenAI `reasoningEffort`, Gemini `thinkingLevel`, Anthropic `effort`), y si
 * un modelo no tiene ese nivel, el SDK usa el más cercano y deja un aviso en el
 * log — por eso no hay tabla propia de niveles por modelo: sería copiar al SDK.
 * Sin `max` a propósito: el SDK no lo expone, y no lo queremos (costo y
 * latencia para el creator, que paga la salida).
 */
export const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

/**
 * Una entrada de modelo como se escribe en el `.env`: `proveedor:modelo` con un
 * esfuerzo opcional, `openai:gpt-6-luna@high`. Sin `@`, el proveedor usa su
 * default. Se separa con `@` y no con otro `:` porque el primer `:` ya es del
 * id y OpenRouter usa `:` dentro del nombre (`modelo:free`).
 */
export interface ModelEntry {
  /** "proveedor:modelo", sin el esfuerzo: es lo que va a `ai_usage_events`. */
  id: string;
  provider: ProviderId;
  model: string;
  reasoning?: ReasoningLevel;
}

export function parseModelEntry(entry: string): ModelEntry {
  const at = entry.lastIndexOf("@");
  const id = at === -1 ? entry : entry.slice(0, at);
  const level = at === -1 ? undefined : entry.slice(at + 1);
  if (level !== undefined && !(REASONING_LEVELS as readonly string[]).includes(level)) {
    throw new Error(
      `Model "${entry}" has an unknown reasoning level "${level}". Use one of: ${REASONING_LEVELS.join(", ")}.`,
    );
  }
  const { provider, model } = parseModelId(id);
  return { id, provider, model, ...(level ? { reasoning: level as ReasoningLevel } : {}) };
}

/**
 * Una variable de modelo del `.env` es una cadena (F10.7): el principal y sus
 * respaldos en orden, separados por coma, cada uno con su `@esfuerzo`.
 * `openai:gpt-6-luna@high, google:gemini-3.8-flash@medium`. Un solo id sigue
 * siendo válido: una cadena de uno.
 */
export function parseModelChain(value: string): ModelEntry[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error(`Model chain "${value}" is empty.`);
  const parsed = entries.map(parseModelEntry);
  const seen = new Set<string>();
  for (const entry of parsed) {
    // El mismo modelo dos veces no es un respaldo: se cae junto con el primero.
    if (seen.has(entry.id)) throw new Error(`Model chain "${value}" repeats "${entry.id}".`);
    seen.add(entry.id);
  }
  return parsed;
}

/** La entrada como se escribe en el `.env`, de vuelta a texto. */
export function formatModelEntry(entry: ModelEntry): string {
  return entry.reasoning ? `${entry.id}@${entry.reasoning}` : entry.id;
}

/**
 * Pega el esfuerzo al modelo resuelto, para que los call sites no lo tengan
 * que repetir y cada modelo de una cadena de respaldo lleve el suyo. Solo
 * llena el hueco: si una llamada pide su propio `reasoning`, gana la llamada.
 */
export function withReasoning(model: LanguageModel, reasoning: ReasoningLevel): LanguageModel {
  return wrapLanguageModel({
    model: model as Exclude<LanguageModel, string>,
    middleware: {
      specificationVersion: "v4",
      transformParams: ({ params }) =>
        Promise.resolve(
          params.reasoning === undefined || params.reasoning === "provider-default"
            ? { ...params, reasoning }
            : params,
        ),
    },
  });
}

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

function buildRegistry(source: EnvSource) {
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

  const assertConfigured = (id: string) => {
    const { provider } = parseModelId(id);
    if (!Object.hasOwn(providers, provider)) {
      throw new Error(
        `Cannot resolve model id "${id}": provider "${provider}" has no API key configured ` +
          `(${PROVIDERS[provider].envKey}). Configured providers: ${Object.keys(providers).join(", ") || "none"}.`,
      );
    }
  };

  return { registry, assertConfigured };
}

// Función pura (recibe el entorno como dato) para poder testearla sin env real.
// Acepta la entrada completa del `.env` (`proveedor:modelo@esfuerzo`): el
// esfuerzo viaja pegado al modelo que devuelve.
export function createModelResolver(source: EnvSource, defaultModelId: string): ModelResolver {
  const { registry, assertConfigured } = buildRegistry(source);
  return (modelEntry?: string): LanguageModel => {
    const { id, reasoning } = parseModelEntry(modelEntry ?? defaultModelId);
    assertConfigured(id);
    const model = registry.languageModel(id as `${string}:${string}`);
    return reasoning ? withReasoning(model, reasoning) : model;
  };
}

/**
 * F10.8: los modelos de embeddings de la memoria. Mismo inventario y mismas
 * keys que el texto y las imágenes. Sin cadena: ver DEFAULT_EMBEDDING_MODEL_ID.
 */
export function createEmbeddingModelResolver(
  source: EnvSource,
): (modelId: string) => ReturnType<ReturnType<typeof createProviderRegistry>["embeddingModel"]> {
  const { registry, assertConfigured } = buildRegistry(source);
  return (modelId: string) => {
    assertConfigured(modelId);
    return registry.embeddingModel(modelId as `${string}:${string}`);
  };
}

/**
 * Lo mismo para modelos de imagen (F10). Mismo inventario de proveedores y
 * mismas keys: un generador de imágenes es otro modelo del mismo proveedor, no
 * un proveedor aparte.
 *
 * Un proveedor sin modelos de imagen (deepseek, kimi) truena al resolver, que
 * es lo que tiene que pasar: env.ts ya validó el formato y la key al boot, así
 * que ese error solo aparece si alguien apuntó la variable a algo que no dibuja.
 */
export function createImageModelResolver(source: EnvSource): ImageModelResolver {
  const { registry, assertConfigured } = buildRegistry(source);
  return (modelId: string): ResolvedImageModel => {
    assertConfigured(modelId);
    return registry.imageModel(modelId as `${string}:${string}`);
  };
}
