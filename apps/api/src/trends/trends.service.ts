import { Inject, Injectable } from "@nestjs/common";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  macroRegionLabel,
  socialNetworkSchema,
  TREND_FORMATS,
  TREND_SIGNALS,
  verticalLabel,
  type TrendItem,
} from "@presencia/shared";
import { AiService } from "../ai/ai.service.js";
import {
  DEFAULT_TRENDS_MODEL_ID,
  GOOGLE_SEARCH_TOOL,
  SEARCH_PROVIDER,
} from "../ai/provider-registry.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { summarizeFailures } from "../jobs/summarize-failures.js";
import { ensamblarTendencias, extraerFuentes } from "./grounding.js";
import { TrendsRepository, type TuplaDeTendencias } from "./trends.repository.js";

// Las tendencias de nicho: buscar lo que se está moviendo, y escribirlo solo
// si tiene de dónde salir.
//
// El recorrido es de dos llamadas, y la separación no es estética:
//
//   1. Una llamada CON búsqueda web. Devuelve prosa y, en el metadata, las
//      páginas que de verdad visitó.
//   2. Una llamada SIN herramientas que convierte esa prosa en items, donde la
//      única forma de señalar procedencia es un índice a la lista de la
//      llamada anterior.
//
// Hacerlo en una sola llamada obligaría a pedirle al modelo que devuelva JSON
// con URLs adentro, y ahí la fuente vuelve a ser algo que el modelo escribe —
// que es exactamente lo que no puede ser (ver grounding.ts).

/** Cuánto dura una tanda antes de pedir refresco. */
const TTL_HORAS = 24;

/**
 * Tuplas por pase del barrido.
 *
 * Cada una cuesta dos llamadas, una de ellas con búsqueda. El tope existe
 * para que un despliegue con muchas verticales activas no dispare el gasto en
 * un solo pase: lo que no entra se refresca en el siguiente, y mientras tanto
 * el usuario ve su tanda de ayer con la fecha a la vista.
 */
const TUPLAS_POR_PASE = 8;

/** Cuántas tendencias se le piden al modelo. La UI pinta las que sobrevivan. */
const MAX_TENDENCIAS = 10;

const MS_POR_HORA = 60 * 60 * 1000;

const esquemaCrudo = z.object({
  tendencias: z
    .array(
      z.object({
        topic: z.string(),
        signal: z.enum(TREND_SIGNALS),
        network: socialNetworkSchema,
        format: z.enum(TREND_FORMATS),
        blurb: z.string(),
        sourceIndex: z.number().int(),
      }),
    )
    .max(MAX_TENDENCIAS),
});

export interface ResultadoDeRefresco {
  tupla: TuplaDeTendencias;
  items: TrendItem[];
  /** Fuentes que devolvió la búsqueda, antes del ensamblado. */
  fuentes: number;
}

@Injectable()
export class TrendsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(TrendsRepository) private readonly repo: TrendsRepository,
  ) {}

  /**
   * Refresca una tupla: busca, ensambla y guarda.
   *
   * **No escribe si no encontró nada.** Ni una fila vacía, ni una fila con lo
   * que el modelo recordaba de su entrenamiento. Dejar intacta la tanda
   * anterior es mejor que reemplazarla por el vacío: el usuario ve tendencias
   * de ayer con su fecha, en vez de un módulo que se apagó sin explicación. Y
   * si nunca hubo tanda, la ausencia de fila es lo que hace que la pantalla
   * muestre su estado vacío honesto.
   */
  async refrescar(tupla: TuplaDeTendencias): Promise<ResultadoDeRefresco> {
    const arranque = Date.now();
    const modelo = this.ai.resolve(env.AI_MODEL_TRENDS ?? DEFAULT_TRENDS_MODEL_ID);
    if (modelo.provider !== SEARCH_PROVIDER) {
      // Fail-fast y no degradación: sin búsqueda, el modelo contestaría desde
      // su entrenamiento. Eso son tendencias viejas con cara de frescas, que
      // es el escenario que presencia-ritmo.md descarta por nombre.
      throw new Error(
        `Las tendencias necesitan búsqueda con grounding y hoy solo la da "${SEARCH_PROVIDER}". ` +
          `AI_MODEL_TRENDS resolvió "${modelo.id}". Apunta esa variable a un modelo de ${SEARCH_PROVIDER}.`,
      );
    }

    const busqueda = await generateText({
      model: modelo.model,
      tools: { google_search: GOOGLE_SEARCH_TOOL },
      prompt: promptDeBusqueda(tupla),
    });

    // El metadata puede venir en el resultado o por step, según cómo el
    // proveedor parta la respuesta. Se juntan los dos y `extraerFuentes`
    // descarta lo que no entienda.
    const fuentes = [
      ...extraerFuentes(busqueda.providerMetadata),
      ...busqueda.steps.flatMap((step) => extraerFuentes(step.providerMetadata)),
    ];
    const unicas = [...new Map(fuentes.map((f) => [f.uri, f])).values()];

    // Sin páginas no hay nada que citar, y sin cita no hay tendencia. Se corta
    // acá para no pagar la segunda llamada por un resultado que ya se sabe
    // vacío.
    if (unicas.length === 0) {
      return { tupla, items: [], fuentes: 0 };
    }

    const estructura = await generateObject({
      model: this.ai.resolveForTask("chat_title").model,
      schema: esquemaCrudo,
      prompt: promptDeEstructura(busqueda.text, unicas),
    });

    const items = ensamblarTendencias(estructura.object.tendencias, unicas);
    if (items.length === 0) return { tupla, items: [], fuentes: unicas.length };

    const ahora = new Date();
    await this.dbService.db.transaction((tx) =>
      this.repo.upsert(tx, {
        ...tupla,
        items,
        generatedAt: ahora,
        expiresAt: new Date(ahora.getTime() + TTL_HORAS * MS_POR_HORA),
        provider: modelo.provider,
        model: modelo.modelName,
        // El gasto viaja con su resultado y no a `ai_usage_events`: esa tabla
        // es por tenant y esta llamada no tiene tenant. Ver ADR-023.
        usage: {
          busqueda: busqueda.usage,
          estructura: estructura.usage,
          fuentes: unicas.length,
          durationMs: Date.now() - arranque,
        },
      }),
    );

    return { tupla, items, fuentes: unicas.length };
  }

  /**
   * El pase periódico: refresca lo que ya venció.
   *
   * Recorre las tuplas que ya existen, que son exactamente las que alguien
   * pidió alguna vez. Una vertical sin usuarios activos no gasta búsquedas, y
   * no hace falta leer `brand_voices` cross-tenant para saberlo.
   *
   * Estructura de ADR-008: enumerar → iterar con try/catch por unidad →
   * contar fallos → relanzar al final. Una tupla que truena no puede dejar sin
   * refrescar a las demás.
   */
  async barrer(): Promise<void> {
    const ahora = new Date();
    const tuplas = await this.dbService.db.transaction((tx) =>
      this.repo.porRefrescar(tx, ahora, TUPLAS_POR_PASE),
    );
    if (tuplas.length === 0) return;

    // `summarizeFailures` cuenta identificadores, no errores: acá el
    // identificador natural es la tupla, porque es la unidad que se refresca.
    const fallidas: string[] = [];
    for (const tupla of tuplas) {
      try {
        const resultado = await this.refrescar(tupla);
        if (resultado.items.length === 0) {
          // No es un fallo: la búsqueda corrió y no trajo nada citable. Se
          // registra porque si pasa siempre para la misma tupla, el problema
          // es el prompt o la vertical, no la red.
          console.warn(
            `[trends] ${tupla.vertical}/${tupla.region}: ${String(resultado.fuentes)} fuentes, 0 tendencias citables`,
          );
        }
      } catch (error) {
        console.error(`[trends] ${claveDe(tupla)} no se pudo refrescar:`, error);
        fallidas.push(claveDe(tupla));
      }
    }
    if (fallidas.length > 0) throw new Error(summarizeFailures("trends.refresh", fallidas));
  }
}

function claveDe(tupla: TuplaDeTendencias): string {
  return `${tupla.vertical}/${tupla.marketCountry}/${tupla.region}`;
}

function promptDeBusqueda(tupla: TuplaDeTendencias): string {
  const vertical = verticalLabel(tupla.vertical);
  const region = macroRegionLabel(tupla.region);
  return [
    `Busca qué temas y formatos de contenido se están moviendo AHORA en redes sociales`,
    `dentro del nicho "${vertical}", para creators de México${
      tupla.region === "nacional" ? "" : ` y en particular de la región ${region}`
    }.`,
    "",
    "Interesa lo reciente: de los últimos días o semanas, no lo perenne.",
    `Busca hasta ${String(MAX_TENDENCIAS)} temas distintos. Para cada uno di de qué se trata,`,
    "en qué red se está moviendo y en qué formato (reel, carrusel, post, video o historia),",
    "y si apenas está apareciendo, si va subiendo o si ya es estable.",
    "",
    "Escribe en español de México, tuteando. No inventes datos: si de algo no",
    "encuentras información, déjalo fuera. No des porcentajes de crecimiento.",
  ].join("\n");
}

function promptDeEstructura(texto: string, fuentes: readonly { title: string }[]): string {
  const listado = fuentes.map((fuente, indice) => `${String(indice)}. ${fuente.title}`).join("\n");
  return [
    "Convierte el siguiente resumen de tendencias en una lista estructurada.",
    "",
    "RESUMEN:",
    texto,
    "",
    "FUENTES CONSULTADAS (usa su número en sourceIndex):",
    listado,
    "",
    "Reglas:",
    "- `sourceIndex` tiene que ser el número de la fuente que respalda ESA tendencia.",
    "  Si una tendencia no viene de ninguna de las fuentes listadas, no la incluyas.",
    "- `blurb`: una o dos frases en español de México, tuteando, diciéndole al creator",
    "  por qué le sirve. Nada de porcentajes.",
    "- `signal`: `new` si apenas aparece, `rising` si va subiendo, `stable` si es constante.",
  ].join("\n");
}
