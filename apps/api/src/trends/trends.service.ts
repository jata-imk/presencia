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
import { BossService } from "../jobs/boss.service.js";
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

/** La cola de la primera búsqueda de una tupla, disparada desde la lectura. */
export const COLA_SEMILLA = "trends.seed";

/**
 * Techo de una búsqueda suelta. La llamada con grounding navega de verdad y
 * puede tardar decenas de segundos; dos minutos dejan margen sin que un job
 * colgado ocupe la cola indefinidamente.
 */
export const SEMILLA_EXPIRE_SECONDS = 120;

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

/**
 * Cuánto se pospone una tupla que no produjo nada.
 *
 * Igual al intervalo del cron: así la tupla se salta exactamente un pase y
 * queda por detrás de cualquier tupla sana recién vencida, en vez de volver a
 * encabezar la fila. Ver `TrendsRepository.posponer`.
 */
const REINTENTO_HORAS = 6;

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
    .max(MAX_TENDENCIAS * 2),
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
    @Inject(BossService) private readonly boss: BossService,
  ) {}

  /**
   * Pide la PRIMERA búsqueda de una tupla que nunca se ha buscado.
   *
   * Sin esto el módulo no arranca nunca, y el hueco es fácil de no ver: el
   * barrido periódico solo refresca filas que YA existen (`porRefrescar` lee
   * de `niche_trends`), así que una tupla sin fila no entra jamás al pase. Un
   * usuario con una vertical que nadie más tiene vería el estado vacío para
   * siempre, con el cron corriendo cada seis horas sin tocarla.
   *
   * Va por cola y no en el request porque la búsqueda tarda decenas de
   * segundos: el usuario ve su estado vacío ahora y sus tendencias en el
   * siguiente refresco, en vez de esperar con la pantalla en blanco.
   */
  async pedirPrimeraBusqueda(tupla: TuplaDeTendencias): Promise<void> {
    await this.boss.enqueue(COLA_SEMILLA, tupla, {
      // Una búsqueda por tupla, aunque diez usuarios del mismo nicho abran
      // Ritmo a la vez. Es la misma palanca por la que la caché no se llavea
      // por usuario.
      singletonKey: claveDe(tupla),
      expireInSeconds: SEMILLA_EXPIRE_SECONDS,
    });
  }

  /**
   * Busca solo si la tupla no tiene una tanda vigente.
   *
   * Es el handler de la cola de semilla, y existe porque la policy `stately`
   * acota los duplicados pero no los elimina: deja a lo más uno corriendo y
   * uno esperando por llave. Sin esta guardia, una ráfaga de aperturas dejaba
   * un segundo job que salía a buscar de nuevo un nicho que el primero acababa
   * de llenar — pagando la llamada cara para sobrescribir lo mismo.
   */
  async refrescarSiHaceFalta(tupla: TuplaDeTendencias): Promise<void> {
    const vigente = await this.dbService.db.transaction(async (tx) => {
      const guardadas = await this.repo.find(tx, tupla);
      return guardadas !== null && guardadas.expiresAt.getTime() > Date.now();
    });
    if (vigente) {
      console.info(`[trends] ${claveDe(tupla)} ya tenía tanda vigente; no se busca de nuevo`);
      return;
    }
    await this.refrescar(tupla);
  }

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
    // Únicas por TÍTULO y no por URL, y eso es una corrección de honestidad.
    // Google reporta el dominio como título, así que una búsqueda normal trae
    // varios chunks de la misma página madre: el modelo veía
    // `0. mexicofollowers.mx`, `3. mexicofollowers.mx`, `7. mexicofollowers.mx`
    // —entradas indistinguibles— y su elección entre ellas era azar. El
    // resultado podía ser un enlace a otra página del mismo dominio que la que
    // sostiene la tendencia.
    //
    // Colapsándolas, el índice deja de ser ambiguo y la cita afirma justo lo
    // que se puede defender: "visto en este medio". Es lo mismo que el usuario
    // lee en la tarjeta.
    const unicas = [...new Map(fuentes.map((f) => [f.title, f])).values()];

    // Sin páginas no hay nada que citar, y sin cita no hay tendencia. Se corta
    // acá para no pagar la segunda llamada por un resultado que ya se sabe
    // vacío.
    if (unicas.length === 0) {
      return { tupla, items: [], fuentes: 0 };
    }

    const estructura = await generateObject({
      // Se pide el TIER, no una tarea: `resolveForTask` obligaría a declarar
      // un AiTaskKind, y ninguno de los que existen es esto. Decir
      // "chat_title" pondría a alguien a afinar AI_MODEL_UTILITY para
      // titulares cortos sin saber que también está tocando una llamada con
      // salida estructurada.
      model: this.ai.resolve(env.AI_MODEL_UTILITY).model,
      schema: esquemaCrudo,
      prompt: promptDeEstructura(busqueda.text, unicas),
    });

    // El recorte va DESPUÉS de ensamblar, no en el schema. Con un `.max`
    // estricto, un modelo que devolviera once items tiraba la validación
    // entera y perdía la tupla — después de haber pagado ya la búsqueda, que
    // es la llamada cara.
    const items = ensamblarTendencias(estructura.object.tendencias, unicas).slice(
      0,
      MAX_TENDENCIAS,
    );
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
            `[trends] ${claveDe(tupla)}: ${String(resultado.fuentes)} fuentes, 0 tendencias citables`,
          );
          await this.posponer(tupla);
        }
      } catch (error) {
        console.error(`[trends] ${claveDe(tupla)} no se pudo refrescar:`, error);
        // Posponer TAMBIÉN cuando truena, y por la misma razón: si no, la
        // tupla que falla siempre acapara el pase entero.
        await this.posponer(tupla);
        fallidas.push(claveDe(tupla));
      }
    }
    if (fallidas.length > 0) {
      throw new Error(summarizeFailures("trends.refresh", fallidas, "tupla(s)"));
    }
  }

  /**
   * Manda una tupla improductiva al final de la fila del barrido.
   *
   * Si esto mismo falla no se relanza: el pase ya tiene su propio resultado que
   * reportar, y tumbarlo por no haber podido posponer cambiaría un problema de
   * prioridad por uno de disponibilidad.
   */
  private async posponer(tupla: TuplaDeTendencias): Promise<void> {
    const hasta = new Date(Date.now() + REINTENTO_HORAS * MS_POR_HORA);
    try {
      await this.dbService.db.transaction((tx) => this.repo.posponer(tx, tupla, hasta));
    } catch (error) {
      console.error(`[trends] ${claveDe(tupla)} no se pudo posponer:`, error);
    }
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
