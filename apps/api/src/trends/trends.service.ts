import { Inject, Injectable } from "@nestjs/common";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  asVerticalId,
  modoEfectivo,
  resolveMacroRegion,
  resolveVertical,
  socialNetworkSchema,
  TREND_FORMATS,
  TREND_SIGNALS,
  trendLangSchema,
  type TrendItem,
  type TrendLang,
} from "@presencia/shared";
import { AiService } from "../ai/ai.service.js";
import {
  DEFAULT_TRENDS_MODEL_ID,
  GOOGLE_SEARCH_TOOL,
  SEARCH_PROVIDER,
} from "../ai/provider-registry.js";
import { BrandVoiceRepository } from "../brand-voice/brand-voice.repository.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { summarizeFailures } from "../jobs/summarize-failures.js";
import { ensamblarTendencias, extraerFuentes } from "./grounding.js";
import {
  estaPersonalizada,
  MAX_TENDENCIAS,
  promptDeBusqueda,
  promptDeEstructura,
  type ContextoDeBusqueda,
} from "./prompt.js";
import { TrendsRepository } from "./trends.repository.js";

// Las tendencias de nicho: buscar lo que se está moviendo para UNA persona, y
// escribirlo solo si tiene de dónde salir.
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
const TTL_DIAS = 7;

/**
 * Usuarios por pase del barrido.
 *
 * Cada uno cuesta dos llamadas, una de ellas con búsqueda, y el fee del
 * grounding se cobra por consulta. El tope existe para que el día que se
 * acumulen muchos vencimientos el gasto no llegue de golpe en un solo pase: lo
 * que no entra se refresca en el siguiente, y mientras tanto el usuario ve su
 * tanda anterior con la fecha a la vista.
 */
const USUARIOS_POR_PASE = 20;

/**
 * Cuánto se pospone un usuario cuya búsqueda no produjo nada.
 *
 * Bastante menos que el TTL: no es un refresco normal, es un reintento. Pero
 * suficiente para que no acapare el pase siguiente, porque el barrido ordena
 * por vencimiento y el suyo volvería a ser el más viejo.
 */
const REINTENTO_HORAS = 12;

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

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
  userId: string;
  items: TrendItem[];
  /** Fuentes que devolvió la búsqueda, antes del ensamblado. */
  fuentes: number;
  /** Consultas de búsqueda que disparó la llamada. Es lo que se factura. */
  consultas: number;
}

@Injectable()
export class TrendsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(TrendsRepository) private readonly repo: TrendsRepository,
    @Inject(BrandVoiceRepository) private readonly voiceRepo: BrandVoiceRepository,
  ) {}

  /**
   * El contexto de búsqueda de un usuario, leído de su voz de marca.
   *
   * Devuelve `null` si todavía no tiene voz: sin nicho no hay nada que buscar,
   * y adivinarlo sería inventarle un mercado.
   */
  async contextoDe(userId: string): Promise<ContextoDeBusqueda | null> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const voz = await this.voiceRepo.findDefault(tx);
      if (!voz) return null;
      const fuentes = await this.repo.fuentes(tx);
      return {
        vertical: resolveVertical(asVerticalId(voz.vertical), voz.niche),
        region: resolveMacroRegion(voz.marketCountry, voz.marketRegion),
        marketCountry: voz.marketCountry,
        niche: voz.niche,
        audience: voz.audience,
        modo: modoEfectivo(voz.modo, voz.extras),
        fuentes: fuentes.map((fuente) => fuente.host),
        prompt: voz.trendPrompt,
        excluye: voz.trendExclude,
        langs: parseLangs(voz.trendLangs),
      };
    });
  }

  /**
   * Busca las tendencias de un usuario y guarda la tanda.
   *
   * **Nunca pisa una tanda buena con el vacío**, ni con lo que el modelo
   * recordara de su entrenamiento: el usuario ve las de la semana pasada con
   * su fecha, en vez de un módulo que se apagó sin explicación. Si no había
   * tanda, sí anota el vacío — la ausencia de fila no es un estado neutro, es
   * lo que hace que el barrido lo vuelva a encolar.
   */
  async refrescarUsuario(userId: string): Promise<ResultadoDeRefresco> {
    const arranque = Date.now();
    const contexto = await this.contextoDe(userId);
    if (!contexto) return { userId, items: [], fuentes: 0, consultas: 0 };

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
      prompt: promptDeBusqueda(contexto),
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
    // varios chunks de la misma página madre: el modelo veía entradas
    // indistinguibles y su elección entre ellas era azar. Colapsándolas, la
    // cita afirma justo lo que se puede defender: "visto en este medio".
    const unicas = [...new Map(fuentes.map((f) => [f.title, f])).values()];
    const consultas = contarConsultas(busqueda.providerMetadata, busqueda.steps);

    // Sin páginas no hay nada que citar, y sin cita no hay tendencia. Se corta
    // acá para no pagar la segunda llamada por un resultado ya vacío.
    if (unicas.length === 0) {
      await this.registrarVacio(userId, modelo, consultas, arranque);
      return { userId, items: [], fuentes: 0, consultas };
    }

    const estructura = await generateObject({
      // Se pide el TIER, no una tarea: `resolveForTask` obligaría a declarar
      // un AiTaskKind, y ninguno de los que existen es esto.
      model: this.ai.resolve(env.AI_MODEL_UTILITY).model,
      schema: esquemaCrudo,
      prompt: promptDeEstructura(busqueda.text, unicas),
    });

    // El recorte va DESPUÉS de ensamblar, no en el schema. Con un `.max`
    // estricto, un modelo que devolviera once items tiraba la validación
    // entera y perdía la tanda — después de haber pagado la búsqueda.
    const items = ensamblarTendencias(estructura.object.tendencias, unicas).slice(
      0,
      MAX_TENDENCIAS,
    );
    if (items.length === 0) {
      await this.registrarVacio(userId, modelo, consultas, arranque);
      return { userId, items: [], fuentes: unicas.length, consultas };
    }

    const ahora = new Date();
    await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.upsert(tx, {
        userId,
        items,
        generatedAt: ahora,
        expiresAt: new Date(ahora.getTime() + TTL_DIAS * MS_POR_DIA),
        provider: modelo.provider,
        model: modelo.modelName,
        usage: {
          busqueda: busqueda.usage,
          estructura: estructura.usage,
          fuentes: unicas.length,
          consultas,
          personalizada: estaPersonalizada(contexto),
          durationMs: Date.now() - arranque,
        },
      }),
    );

    return { userId, items, fuentes: unicas.length, consultas };
  }

  /**
   * El pase periódico: refresca a quien le venció la tanda o nunca tuvo.
   *
   * Estructura de ADR-008: enumerar → iterar con try/catch por unidad → contar
   * fallos → relanzar al final. Un usuario que truena no puede dejar sin
   * refrescar a los demás.
   */
  async barrer(): Promise<void> {
    const ahora = new Date();
    const usuarios = await this.dbService.runWorkerScan((tx) =>
      this.repo.porRefrescar(tx, ahora, USUARIOS_POR_PASE),
    );
    if (usuarios.length === 0) return;

    const fallidos: string[] = [];
    for (const userId of usuarios) {
      try {
        const resultado = await this.refrescarUsuario(userId);
        if (resultado.items.length === 0) {
          // No es un fallo: la búsqueda corrió y no trajo nada citable. Se
          // registra porque si pasa siempre para el mismo usuario, el problema
          // es su configuración o su nicho, no la red.
          console.warn(
            `[trends] ${userId}: ${String(resultado.fuentes)} fuentes, 0 tendencias citables`,
          );
        }
      } catch (error) {
        console.error(`[trends] no se pudo refrescar a ${userId}:`, error);
        // Posponer TAMBIÉN cuando truena, y por la misma razón: si no, el
        // usuario que falla siempre acapara el pase entero.
        await this.posponer(userId);
        fallidos.push(userId);
      }
    }
    if (fallidos.length > 0) {
      throw new Error(summarizeFailures("trends.refresh", fallidos, "usuario(s)"));
    }
  }

  /**
   * Deja constancia de que se buscó y no había nada citable.
   *
   * Solo escribe si NO había tanda. Si ya existía una buena se conserva
   * —tendencias de la semana pasada fechadas le sirven más al usuario que un
   * módulo apagado— y de moverle el vencimiento se encarga `posponer`.
   *
   * La fila vacía vuelve alcanzable un estado que si no no lo sería: la
   * pantalla distingue "todavía no buscamos" de "buscamos y no encontramos"
   * por `generatedAt`.
   */
  private async registrarVacio(
    userId: string,
    modelo: { provider: string; modelName: string },
    consultas: number,
    arranque: number,
  ): Promise<void> {
    const ahora = new Date();
    try {
      await this.dbService.runWithTenant(userId, async (tx) => {
        const guardadas = await this.repo.find(tx);
        if (guardadas && guardadas.items.length > 0) {
          await this.repo.posponer(tx, new Date(ahora.getTime() + REINTENTO_HORAS * MS_POR_HORA));
          return;
        }
        await this.repo.upsert(tx, {
          userId,
          items: [],
          generatedAt: ahora,
          expiresAt: new Date(ahora.getTime() + REINTENTO_HORAS * MS_POR_HORA),
          provider: modelo.provider,
          model: modelo.modelName,
          usage: { vacio: true, consultas, durationMs: Date.now() - arranque },
        });
      });
    } catch (error) {
      // No se relanza: quien llama ya tiene su propio resultado que reportar, y
      // no haber podido anotar el vacío no convierte la búsqueda en un fallo.
      console.error(`[trends] ${userId}: no se pudo registrar el vacío:`, error);
    }
  }

  /** Manda a un usuario improductivo al final de la fila del barrido. */
  private async posponer(userId: string): Promise<void> {
    const hasta = new Date(Date.now() + REINTENTO_HORAS * MS_POR_HORA);
    try {
      await this.dbService.runWithTenant(userId, (tx) => this.repo.posponer(tx, hasta));
    } catch (error) {
      console.error(`[trends] ${userId} no se pudo posponer:`, error);
    }
  }
}

/**
 * Cuántas consultas de búsqueda disparó la llamada.
 *
 * Es el número que decide la factura: el grounding se cobra por CONSULTA, no
 * por request ni por token, y una sola llamada puede lanzar varias. Antes no se
 * guardaba, así que cualquier proyección de costo era una corazonada.
 *
 * Si el proveedor no lo reporta queda en 0, que es honesto —no lo sabemos— y
 * distinguible de "no hubo búsqueda", porque eso deja la lista de fuentes
 * vacía.
 */
function contarConsultas(
  metadata: unknown,
  steps: readonly { providerMetadata?: unknown }[],
): number {
  const deUno = (raw: unknown): number => {
    const google = (raw as { google?: { groundingMetadata?: { webSearchQueries?: unknown } } })
      ?.google;
    const queries = google?.groundingMetadata?.webSearchQueries;
    return Array.isArray(queries) ? queries.length : 0;
  };
  return steps.reduce((suma, step) => suma + deUno(step.providerMetadata), deUno(metadata));
}

/** Los idiomas guardados, validados. Un valor raro no apaga la búsqueda. */
function parseLangs(raw: readonly string[]): TrendLang[] {
  const langs = raw
    .map((valor) => trendLangSchema.safeParse(valor))
    .flatMap((p) => (p.success ? [p.data] : []));
  return langs.length > 0 ? langs : ["es"];
}
