import { tool, type Tool } from "ai";
import {
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCHES_PER_TURN,
  webSearchInputSchema,
  type WebSearchInput,
  type WebSearchOutput,
} from "@presencia/shared";
import { insideTag, safeName } from "../chat/attachment-context.js";
import type { WebSearchService } from "./web-search.service.js";

// F10.10 (ADR-028): la tool `buscar_en_web`. Una por turno (el tope se cuenta
// aquí). Lo que devuelve `execute` se guarda completo en la parte del mensaje
// (los resultados son chicos) y lo ve la UI como fuentes; lo que lee el modelo
// lo arma `toModelOutput`: los resultados delimitados, como datos de terceros.

export function resultsForModel(output: WebSearchOutput): string {
  if (output.estado === "limite") {
    return (
      `No se buscó "${safeName(output.consulta)}": ya buscaste ${String(WEB_SEARCHES_PER_TURN)} ` +
      "veces en este mensaje, el máximo. Contesta con lo que ya encontraste y, si falta algo, " +
      "dilo y ofrece buscarlo en otro mensaje."
    );
  }
  if (output.estado === "no_disponible") {
    return (
      `La búsqueda de "${safeName(output.consulta)}" no se pudo hacer: el buscador no está ` +
      "disponible en este momento. Díselo al creator y contesta sin datos de la web; no inventes " +
      "precios, horarios ni fechas."
    );
  }
  if (output.estado === "sin_resultados") {
    return (
      `La búsqueda de "${safeName(output.consulta)}" no trajo resultados. Dilo; puedes probar ` +
      "con otras palabras si te queda una búsqueda."
    );
  }
  const items = output.resultados.map((r, i) =>
    [
      `${String(i + 1)}. ${safeName(r.titulo)} — ${r.dominio}${r.fecha ? ` (${safeName(r.fecha, 40)})` : ""}`,
      `   ${r.url}`,
      `   ${r.fragmento}`,
    ].join("\n"),
  );
  return [
    `<resultados consulta="${safeName(output.consulta)}">`,
    insideTag(items.join("\n\n"), "resultados"),
    "</resultados>",
  ].join("\n");
}

export function buildWebSearchTool(deps: {
  userId: string;
  chatId: string;
  runId: string | null;
  // Solo lo que la tool usa: la suite cultural le pasa uno de mentira tipado contra esto.
  service: Pick<WebSearchService, "search">;
}): { [WEB_SEARCH_TOOL_NAME]: Tool<WebSearchInput, WebSearchOutput> } {
  let searches = 0;
  // La misma consulta dos veces en un paso (en paralelo) se busca y se cobra una vez.
  const inFlight = new Map<string, Promise<WebSearchOutput>>();

  return {
    [WEB_SEARCH_TOOL_NAME]: tool({
      description:
        "Busca en la web. Úsala para lo que cambia o es reciente: precios, horarios, fechas de " +
        "eventos, noticias, cifras de este año, o algo posterior a lo que sabes. También cuando " +
        "el creator te pida buscar algo. No la uses para escribir un post de su propio negocio ni " +
        "para ideas o consejos generales. Escribe la consulta como en un buscador e incluye el " +
        'lugar si importa ("precio del café en Mérida"). Devuelve 5 resultados con su ' +
        "fragmento; si el fragmento no trae el dato, abre la página con leer_enlace.",
      inputSchema: webSearchInputSchema,
      execute: ({ consulta }, { abortSignal }): Promise<WebSearchOutput> => {
        abortSignal?.throwIfAborted();
        const key = consulta.trim().toLowerCase();
        const pending = inFlight.get(key);
        if (pending) return pending;
        if (searches >= WEB_SEARCHES_PER_TURN) {
          return Promise.resolve({ searchId: null, consulta, estado: "limite", resultados: [] });
        }
        searches += 1;
        // Solo mientras corre: una búsqueda que falló (no_disponible) se puede
        // reintentar en otro paso, y entonces sí cuenta para el tope.
        const search = deps.service
          .search(deps.userId, deps.chatId, consulta, deps.runId, abortSignal)
          .finally(() => inFlight.delete(key));
        inFlight.set(key, search);
        return search;
      },
      toModelOutput: ({ output }) => ({ type: "text", value: resultsForModel(output) }),
    }),
  };
}
