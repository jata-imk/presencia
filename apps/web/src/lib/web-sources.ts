import {
  READ_LINK_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  type ReadLinkOutput,
  type WebSearchOutput,
} from "@presencia/shared";
import type { ChatUIMessage } from "./chat-types.js";
import { domainOfUrl } from "./turn-steps.js";

// F10.10 (Chat Web.html): las fuentes de una respuesta, la evidencia debajo
// del texto. Puro: sale de los tool parts y del texto del mensaje.
//
// Qué cuenta como fuente:
// - una página que se leyó (bien, o a medias, con su marca);
// - un resultado de búsqueda que la respuesta cita (su URL aparece en el
//   texto). Los demás resultados se quedan fuera: cinco por búsqueda llenarían
//   la lista de lo que el modelo ni usó.
// - Si se buscó y no se leyó ni se citó nada, se listan los resultados: algo
//   tuvo que salir de ahí, y es mejor mostrarlo que esconder de dónde.
// Lo que no se pudo leer no es fuente: vive en la lista de pasos.

export interface WebSource {
  titulo: string;
  dominio: string;
  url: string;
  fecha: string | null;
  /** El fragmento del buscador; solo lo traen los resultados de búsqueda. */
  fragmento: string | null;
  /** Una lectura a medias: la página era muy larga, o solo había su descripción. */
  marca: "parcial" | "descripcion" | null;
}

/** Para comparar URLs: sin `#`, sin la barra final y sin `www.`. */
function urlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * La fecha del buscador para leerla: Brave manda ISO ("2026-06-12T14:13:00"),
 * que se vuelve "12 jun 2026"; lo que ya viene escrito ("hace 2 días") pasa
 * tal cual. Solo el día: la hora no dice nada y su zona no viene.
 */
export function displayDate(fecha: string | null): string | null {
  const iso = fecha?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return fecha;
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return Number.isNaN(date.getTime()) ? fecha : SHORT_DATE.format(date);
}

function citedUrls(text: string): Set<string> {
  const keys = new Set<string>();
  for (const match of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) keys.add(urlKey(match[1]!));
  return keys;
}

export function webSources(message: ChatUIMessage): WebSource[] {
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
  const cited = citedUrls(text);
  const sources: WebSource[] = [];
  const seen = new Set<string>();
  const add = (source: WebSource) => {
    const key = urlKey(source.url);
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };

  const done = message.parts.filter((p) => "state" in p && p.state === "output-available") as {
    type: string;
    output: unknown;
  }[];

  const searchResults: WebSource[] = done
    .filter((p) => p.type === `tool-${WEB_SEARCH_TOOL_NAME}`)
    .flatMap((p) =>
      (p.output as WebSearchOutput).resultados.map((r) => ({
        titulo: r.titulo,
        dominio: r.dominio,
        url: r.url,
        fecha: displayDate(r.fecha),
        fragmento: r.fragmento || null,
        marca: null,
      })),
    );
  const fromSearch = new Map(searchResults.map((r) => [urlKey(r.url), r]));

  for (const p of done.filter((p) => p.type === `tool-${READ_LINK_TOOL_NAME}`)) {
    const out = p.output as ReadLinkOutput;
    if (out.estado !== "ok") continue;
    const url = out.urlFinal ?? out.url;
    // Una página que se abrió desde la búsqueda conserva su fecha y su fragmento.
    const result = fromSearch.get(urlKey(url)) ?? fromSearch.get(urlKey(out.url));
    add({
      titulo: out.titulo ?? result?.titulo ?? out.dominio ?? domainOfUrl(url),
      dominio: out.dominio ?? domainOfUrl(url),
      url,
      fecha: result?.fecha ?? null,
      fragmento: result?.fragmento ?? null,
      marca: out.soloDescripcion ? "descripcion" : out.truncado ? "parcial" : null,
    });
  }

  const citedResults = searchResults.filter((r) => cited.has(urlKey(r.url)));
  for (const r of citedResults) add(r);
  if (sources.length === 0) for (const r of searchResults) add(r);
  return sources;
}
