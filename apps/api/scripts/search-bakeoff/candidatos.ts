import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { normalizeTrendSource } from "@presencia/shared";
import { costOf } from "../../src/ai/model-prices.js";
import { createModelResolver, DEFAULT_MODEL_ID } from "../../src/ai/provider-registry.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";

// Los candidatos del bake-off de búsqueda (F10.10).
//
// Dos clases:
// - "api": un servicio de búsqueda detrás de una tool propia. Es lo que se
//   está eligiendo: el chat lo llamaría igual con cualquier modelo de la
//   cadena (ADR-028).
// - "nativa": la búsqueda que trae cada proveedor de modelos. NO es opción
//   (se pierde en el respaldo de la cadena y cambia de forma por modelo);
//   está como referencia de calidad, para saber cuánto se deja en la mesa.
//
// Ubicación: Mérida, México, en todos los que la aceptan.
//
// Precios por búsqueda: los de `model-prices.ts` (fuentes secundarias del
// 2026-10-25; se confirman en la consola de cada proveedor antes de decidir).
// Exa reporta su costo real en la respuesta (`costDollars`) y ese manda.

export interface Resultado {
  titulo: string;
  url: string;
  dominio: string;
  fragmento: string;
  /** Lo que el servicio diga de la fecha, tal cual. */
  fecha: string | null;
}

export interface Busqueda {
  resultados: Resultado[];
  costUsd: number | null;
  /** Solo las nativas: lo que contestó el modelo con lo que encontró. */
  respuesta?: string;
  /** Cuántas búsquedas hizo de verdad (las nativas pueden hacer varias o ninguna). */
  busquedas: number;
}

export interface Candidato {
  id: string;
  clase: "api" | "nativa";
  /** Variables del `.env` que necesita: el script falla antes de gastar si falta una. */
  requiere: string[];
  /** De dónde sale el precio. */
  precio: string;
  buscar(consulta: string): Promise<Busqueda>;
}

const RESULTADOS = 5;
const TIMEOUT_MS = 30_000;

function dominioDe(url: string, titulo?: string | null): string {
  const host = normalizeTrendSource(url) ?? url;
  // Gemini devuelve un redirect de Vertex, no la página; su título es el dominio.
  if (host.endsWith("vertexaisearch.cloud.google.com") && titulo) return titulo;
  return host;
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/**
 * Texto plano de un fragmento, recortado. Brave marca la coincidencia con
 * `<strong>` y algunos traen entidades: en la galería se verían como
 * etiquetas y delatarían al candidato.
 */
function recorta(texto: string | null | undefined, max = 400): string {
  const limpio = (texto ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTIDADES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

async function pedir(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const texto = await res.text();
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}: ${texto.slice(0, 200)}`);
  return JSON.parse(texto) as unknown;
}

/**
 * El costo de una búsqueda de API, de la tabla de precios (o el que reporta
 * el servicio), y su línea en el gasto local: sin ella, `pnpm gasto` no vería
 * lo que cuesta el bake-off. El gasto local no guarda dólares, solo la
 * búsqueda, así que `pnpm gasto` siempre la valúa con la tabla: con Exa, que
 * reporta su costo real, los dos reportes pueden diferir por centavos.
 */
async function costoApi(modelId: string, reportado?: number): Promise<number | null> {
  const id = splitModelId(modelId);
  await registrarGasto({
    script: "bakeoff-busqueda",
    ...id,
    task: "web_search",
    inputTokens: 0,
    outputTokens: 0,
    searchQueries: 1,
  });
  return reportado ?? costOf({ ...id, inputTokens: 0, outputTokens: 0, searchQueries: 1 });
}

function key(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en el .env`);
  return valor;
}

const brave: Candidato = {
  id: "brave",
  clase: "api",
  requiere: ["BRAVE_SEARCH_API_KEY"],
  precio: "$5/1k",
  async buscar(consulta) {
    const params = new URLSearchParams({
      q: consulta,
      country: "MX",
      search_lang: "es",
      count: String(RESULTADOS),
      extra_snippets: "true",
    });
    const data = (await pedir(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key("BRAVE_SEARCH_API_KEY") },
    })) as {
      web?: {
        results?: {
          title: string;
          url: string;
          description?: string;
          extra_snippets?: string[];
          age?: string;
          page_age?: string;
        }[];
      };
    };
    return {
      resultados: (data.web?.results ?? []).slice(0, RESULTADOS).map((r) => ({
        titulo: r.title,
        url: r.url,
        dominio: dominioDe(r.url),
        // Lo mismo que vería el modelo: la descripción y los extras, juntos.
        fragmento: recorta([r.description, ...(r.extra_snippets ?? [])].join(" "), 600),
        fecha: r.page_age ?? r.age ?? null,
      })),
      costUsd: await costoApi("brave:web-search"),
      busquedas: 1,
    };
  },
};

const tavily: Candidato = {
  id: "tavily",
  clase: "api",
  requiere: ["TAVILY_API_KEY"],
  precio: "$8/1k (basic, pago por uso)",
  async buscar(consulta) {
    const data = (await pedir("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key("TAVILY_API_KEY")}`,
      },
      body: JSON.stringify({
        query: consulta,
        search_depth: "basic",
        max_results: RESULTADOS,
        topic: "general",
        country: "mexico",
        include_published_date: true,
      }),
    })) as {
      results?: { title: string; url: string; content?: string; published_date?: string | null }[];
    };
    return {
      resultados: (data.results ?? []).map((r) => ({
        titulo: r.title,
        url: r.url,
        dominio: dominioDe(r.url),
        fragmento: recorta(r.content, 600),
        fecha: r.published_date ?? null,
      })),
      costUsd: await costoApi("tavily:search-basic"),
      busquedas: 1,
    };
  },
};

const exa: Candidato = {
  id: "exa",
  clase: "api",
  requiere: ["EXA_API_KEY"],
  precio: "$7/1k con contents (o su costDollars)",
  async buscar(consulta) {
    const data = (await pedir("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key("EXA_API_KEY") },
      body: JSON.stringify({
        query: consulta,
        type: "auto",
        numResults: RESULTADOS,
        userLocation: "MX",
        contents: { highlights: { maxCharacters: 600 } },
      }),
    })) as {
      results?: {
        title?: string | null;
        url: string;
        publishedDate?: string | null;
        highlights?: string[];
      }[];
      costDollars?: { total?: number };
    };
    return {
      resultados: (data.results ?? []).map((r) => ({
        titulo: r.title ?? r.url,
        url: r.url,
        dominio: dominioDe(r.url),
        fragmento: recorta((r.highlights ?? []).join(" "), 600),
        fecha: r.publishedDate ?? null,
      })),
      costUsd: await costoApi("exa:search-auto", data.costDollars?.total),
      busquedas: 1,
    };
  },
};

const serper: Candidato = {
  id: "serper",
  clase: "api",
  requiere: ["SERPER_API_KEY"],
  precio: "$1/1k (paquete de $50)",
  async buscar(consulta) {
    const data = (await pedir("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key("SERPER_API_KEY") },
      body: JSON.stringify({ q: consulta, gl: "mx", hl: "es-419", num: 10 }),
    })) as {
      organic?: { title: string; link: string; snippet?: string; date?: string }[];
    };
    return {
      resultados: (data.organic ?? []).slice(0, RESULTADOS).map((r) => ({
        titulo: r.title,
        url: r.link,
        dominio: dominioDe(r.link),
        fragmento: recorta(r.snippet),
        fecha: r.date ?? null,
      })),
      costUsd: await costoApi("serper:search"),
      busquedas: 1,
    };
  },
};

// Las nativas: el mismo modelo de la cadena de producción, con su tool de
// búsqueda y un prompt que lo obliga a buscar. La lista de fuentes es la que
// el SDK normaliza (`sources` de cada paso); el fragmento no existe en las
// nativas, así que se califica la respuesta junto con las fuentes.
const resolveModel = createModelResolver(process.env, process.env.AI_MODEL ?? DEFAULT_MODEL_ID);
const UBICACION = {
  type: "approximate" as const,
  country: "MX",
  region: "Yucatán",
  city: "Mérida",
};

function nativa(
  id: string,
  modelId: string,
  requiere: string,
  precio: string,
  tools: ToolSet,
): Candidato {
  return {
    id,
    clase: "nativa",
    requiere: [requiere],
    precio,
    async buscar(consulta) {
      const result = await generateText({
        model: resolveModel(modelId),
        tools,
        stopWhen: stepCountIs(3),
        // Holgado: si se corta, el SDK no entrega el usage de lo ya cobrado y
        // ese gasto no llegaría al registro local.
        abortSignal: AbortSignal.timeout(TIMEOUT_MS * 4),
        prompt:
          `Busca en la web: "${consulta}". Usa la herramienta de búsqueda aunque creas saberlo. ` +
          "Contesta en dos o tres frases en español de México con lo que encontraste, con fechas si las hay.",
      });
      const vistas = new Set<string>();
      const resultados: Resultado[] = [];
      for (const s of result.steps.flatMap((step) => step.sources)) {
        if (s.sourceType !== "url" || vistas.has(s.url)) continue;
        vistas.add(s.url);
        resultados.push({
          titulo: s.title ?? s.url,
          url: s.url,
          dominio: dominioDe(s.url, s.title),
          fragmento: "",
          fecha: null,
        });
      }
      // Gemini dice cuántas consultas corrió; OpenAI y Anthropic, cuántas
      // llamadas a su tool hubo. La del resultado copia el último paso
      // (lección de F9.8): se cuenta por paso.
      const busquedas = result.steps.reduce((n, step) => {
        const gemini = (
          step.providerMetadata as
            { google?: { groundingMetadata?: { webSearchQueries?: unknown[] } } } | undefined
        )?.google?.groundingMetadata?.webSearchQueries?.length;
        const llamadas = step.content.filter((p) => p.type === "tool-call").length;
        return n + (gemini ?? llamadas);
      }, 0);
      const inputTokens = result.totalUsage.inputTokens ?? 0;
      const outputTokens = result.totalUsage.outputTokens ?? 0;
      await registrarGasto({
        script: "bakeoff-busqueda",
        ...splitModelId(modelId),
        task: "chat",
        inputTokens,
        outputTokens,
        searchQueries: busquedas,
      });
      return {
        resultados: resultados.slice(0, RESULTADOS),
        respuesta: recorta(result.text, 800),
        costUsd: costOf({
          ...splitModelId(modelId),
          inputTokens,
          outputTokens,
          cachedInputTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens ?? null,
          searchQueries: busquedas,
        }),
        busquedas,
      };
    },
  };
}

export const CANDIDATOS: Candidato[] = [
  brave,
  tavily,
  exa,
  serper,
  nativa(
    "nativa-gemini",
    "google:gemini-3.8-flash@medium",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "$14/1k consultas + tokens",
    { google_search: google.tools.googleSearch({}) },
  ),
  nativa("nativa-openai", "openai:gpt-6-luna@high", "OPENAI_API_KEY", "$10/1k llamadas + tokens", {
    web_search: openai.tools.webSearch({ searchContextSize: "medium", userLocation: UBICACION }),
  }),
  nativa(
    "nativa-anthropic",
    "anthropic:claude-sonnet-5-5",
    "ANTHROPIC_API_KEY",
    "$10/1k búsquedas + tokens",
    {
      web_search: anthropic.tools.webSearch_20260318({
        maxUses: 2,
        userLocation: { ...UBICACION, timezone: "America/Merida" },
      }),
    },
  ),
];
