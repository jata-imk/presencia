import { normalizeTrendSource, WEB_SEARCH_RESULTS, type WebSearchResult } from "@presencia/shared";

// F10.10 (ADR-028): el buscador detrás de `buscar_en_web`. Como la publicación
// (ADR-009), una interfaz y un adapter por servicio: el chat no sabe a quién
// le pregunta. Hoy uno real (Brave, elegido en el bake-off) y uno de mentira
// para dev y tests. Sin respaldo, como los embeddings: si el buscador se cae,
// la tool contesta `no_disponible` y el modelo lo dice.

export const SEARCH_PROVIDER = Symbol("SEARCH_PROVIDER");

export interface SearchProvider {
  /** Para la fila de `ai_usage_events` (`provider:model`, con su precio en model-prices.ts). */
  readonly provider: string;
  readonly model: string;
  /** Lanza si el servicio falla; una búsqueda sin resultados es una lista vacía. */
  search(query: string, signal?: AbortSignal): Promise<WebSearchResult[]>;
}

/** Cuánto espera a un buscador antes de darlo por caído. */
const SEARCH_TIMEOUT_MS = 8_000;
/** Lo que se guarda y ve el modelo de cada fragmento. */
const SNIPPET_CHARS = 600;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Texto plano: Brave marca la coincidencia con `<strong>` y trae entidades. */
export function plainSnippet(text: string | null | undefined, max = SNIPPET_CHARS): string {
  const clean = (text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTIDADES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

interface BraveResponse {
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
}

/**
 * Brave Search API. Los mismos parámetros que ganaron el bake-off
 * (scripts/search-bakeoff/candidatos.ts): México y español, con los
 * fragmentos extra, que son los que traen el dato (el precio, el horario).
 */
export class BraveSearchProvider implements SearchProvider {
  readonly provider = "brave";
  readonly model = "web-search";

  constructor(private readonly apiKey: string) {}

  async search(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      country: "MX",
      search_lang: "es",
      count: String(WEB_SEARCH_RESULTS),
      extra_snippets: "true",
    });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      signal: AbortSignal.any(
        [AbortSignal.timeout(SEARCH_TIMEOUT_MS), signal].filter(
          (s): s is AbortSignal => s !== undefined,
        ),
      ),
    });
    if (!res.ok) {
      throw new Error(`Brave contestó ${String(res.status)}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as BraveResponse;
    return (data.web?.results ?? []).slice(0, WEB_SEARCH_RESULTS).map((r) => ({
      titulo: plainSnippet(r.title, 300),
      url: r.url,
      dominio: normalizeTrendSource(r.url) ?? r.url,
      fragmento: plainSnippet([r.description, ...(r.extra_snippets ?? [])].join(" ")),
      fecha: r.page_age ?? r.age ?? null,
    }));
  }
}

/**
 * Resultados fijos y sin red, para dev y tests (WEB_SEARCH_PROVIDER=fake).
 * Dicen que son de mentira para que nadie los tome por datos.
 */
export class FakeSearchProvider implements SearchProvider {
  readonly provider = "fake";
  readonly model = "web-search";

  search(query: string): Promise<WebSearchResult[]> {
    return Promise.resolve([
      {
        titulo: `Resultado de prueba para "${query}"`,
        url: "https://ejemplo.mx/resultado-de-prueba",
        dominio: "ejemplo.mx",
        fragmento:
          "Este es un resultado de mentira del buscador de desarrollo (WEB_SEARCH_PROVIDER=fake). " +
          "No es información real: dilo si alguien pregunta.",
        fecha: null,
      },
    ]);
  }
}
