import type { ToolSet } from "ai";
import type { WebSearchOutput, WebSearchResult } from "@presencia/shared";
import { buildWebSearchTool } from "../../src/web/web-search.tool.js";
import type { WebSearchService } from "../../src/web/web-search.service.js";

// F10.10: la tool `buscar_en_web` de la suite. Es la de producción
// (buildWebSearchTool: misma descripción, mismo tope y el mismo
// `toModelOutput` que arma <resultados>), con un buscador de mentira que
// contesta con resultados fijos según la consulta, sin salir a la red ni
// cobrar: cada modelo encuentra lo mismo y el reporte se puede comparar.
//
// La suite corre con la fecha fija de SUITE_TODAY (run.ts, 28 de octubre de
// 2026). Los resultados del museo son de octubre; los de eventos, de junio a
// propósito: es lo que pasó en vivo (2026-10-28), cuando el modelo presentó
// los planes del 12 al 14 de junio como los de "este fin de semana".

const MUSEO: WebSearchResult[] = [
  {
    titulo: "Gran Museo del Mundo Maya: horarios y costos 2026",
    url: "https://www.granmuseodelmundomaya.com.mx/visita",
    dominio: "granmuseodelmundomaya.com.mx",
    fragmento:
      "Entrada general 250 pesos; residentes de Yucatán con INE 100 pesos. Abierto de miércoles a lunes de 8 a 17 h; los martes cierra.",
    fecha: "2026-10-01",
  },
  {
    titulo: "Museos de Mérida: precios actualizados en octubre",
    url: "https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios",
    dominio: "diariodeyucatan.com",
    fragmento:
      "El Gran Museo del Mundo Maya mantiene su entrada general en 250 pesos y el espectáculo de luz y sonido sigue siendo gratuito.",
    fecha: "2026-10-12T09:00:00",
  },
];

const EVENTOS_DE_JUNIO: WebSearchResult[] = [
  {
    titulo: "¿Qué hacer el fin de semana en Yucatán? Planes del 12 al 14 de junio en Mérida",
    url: "https://yucatan.heraldodemexico.com.mx/2026/06/12/planes-fin-de-semana",
    dominio: "yucatan.heraldodemexico.com.mx",
    fragmento:
      "Este fin de semana en Mérida: Pok ta pok en la Plaza Grande, cine bajo las estrellas en Santa Lucía y la feria del libro infantil.",
    fecha: "2026-06-12T14:13:00",
  },
  {
    titulo: "Más de 20 eventos gratis en Mérida este fin de semana",
    url: "https://notirasa.com/2026/06/11/eventos-gratis-merida",
    dominio: "notirasa.com",
    fragmento:
      "Conciertos, cine, exposiciones y actividades para toda la familia este fin de semana en Mérida.",
    fecha: "2026-06-11T00:00:00",
  },
];

function resultsFor(consulta: string): WebSearchResult[] {
  const q = consulta.toLowerCase();
  if (q.includes("museo")) return MUSEO;
  if (/evento|fin de semana|qué hacer|que hacer|planes/.test(q)) return EVENTOS_DE_JUNIO;
  return [];
}

const fakeService: Pick<WebSearchService, "search"> = {
  search: (_userId, _chatId, consulta): Promise<WebSearchOutput> => {
    const resultados = resultsFor(consulta);
    return Promise.resolve({
      searchId: `suite-${consulta}`,
      consulta,
      estado: resultados.length > 0 ? "ok" : "sin_resultados",
      resultados,
    });
  },
};

/** La tool de producción, una por corrida (lleva el tope del turno adentro). */
export function suiteWebSearchTools(): ToolSet {
  return buildWebSearchTool({
    userId: "suite",
    chatId: "suite",
    runId: null,
    service: fakeService,
  });
}
