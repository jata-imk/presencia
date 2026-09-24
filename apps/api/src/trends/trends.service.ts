import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
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
  type TrendRefreshStateDto,
} from "@presencia/shared";
import { AiService } from "../ai/ai.service.js";
import {
  DEFAULT_TRENDS_MODEL_ID,
  GOOGLE_SEARCH_TOOL,
  SEARCH_PROVIDER,
} from "../ai/provider-registry.js";
import { BrandVoiceRepository } from "../brand-voice/brand-voice.repository.js";
import { CreditsService } from "../credits/credits.service.js";
import { flatActionPercentOfQuota, quoteFlatAction } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { summarizeFailures } from "../jobs/summarize-failures.js";
import { ensamblarTendencias, extraerFuentes } from "./grounding.js";
import {
  estaPersonalizada,
  MAX_TENDENCIAS,
  promptDeBusqueda,
  promptDeEstructura,
  type ContextoDeBusqueda,
} from "./prompt.js";
import { esCobrable } from "./cobro.js";
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

/**
 * El refresco manual que hay que liquidar al terminar.
 *
 * `billable` viaja acá dentro y no se vuelve a calcular en el handler, y esa
 * es la decisión: se resolvió al pedirlo, cuando el usuario todavía tenía en
 * pantalla la tanda que está adelantando. Cuarenta segundos después, la tanda
 * ya es otra y la pregunta ya no se puede rehacer.
 */
export interface CobroDeRefresco {
  id: string;
  billable: boolean;
}

/** La cola del refresco manual. La registra el worker; la API solo encola. */
export const MANUAL_REFRESH_QUEUE = "trends.refresh.manual";

/**
 * Techo de un refresco manual: dos llamadas para UN usuario.
 *
 * Mucho menos que los 25 minutos del pase, que trabaja sobre veinte. pg-boss
 * no mata al handler cuando expira —marca el job fallido y libera el slot—,
 * así que esto no cancela nada: acota cuánto puede tapar la cola un job
 * colgado.
 */
export const MANUAL_REFRESH_EXPIRE_SECONDS = 6 * 60;

const REASON_REFRESCO = "trend_refresh" as const;
const REFERENCE_TYPE_REFRESCO = "trend_refresh";

@Injectable()
export class TrendsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(TrendsRepository) private readonly repo: TrendsRepository,
    @Inject(BrandVoiceRepository) private readonly voiceRepo: BrandVoiceRepository,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BossService) private readonly boss: BossService,
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
  async refrescarUsuario(userId: string, cobro?: CobroDeRefresco): Promise<ResultadoDeRefresco> {
    const arranque = Date.now();
    const contexto = await this.contextoDe(userId);
    if (!contexto) {
      // Sin voz de marca no hay nada que buscar. Pero hay que DEJAR CONSTANCIA
      // igual: el barrido pone primero a quien no tiene tanda, así que un
      // usuario a medio onboarding —correo verificado y sesión viva, que es lo
      // que el filtro pide, pero sin haber llegado al paso de la Voz— se
      // quedaba a la cabeza de la fila en todos los pases, para siempre.
      // Veinte de esos se comían el presupuesto entero y nadie con la tanda
      // vencida se refrescaba jamás.
      await this.marcarIntento(userId, { motivo: "sin_voz" });
      await this.liquidar(userId, cobro, "sin_voz");
      return { userId, items: [], fuentes: 0, consultas: 0 };
    }

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

    // Solo `steps`. El `providerMetadata` del resultado es una COPIA del
    // último step —así lo documenta el SDK, y por eso está deprecado en favor
    // de `finalStep.providerMetadata`— así que leerlo aparte cuenta ese step
    // dos veces. Medido contra la API: un step con 3 consultas y 8 chunks
    // aparecía idéntico en los dos lados. Acá el `Map` de abajo lo disimulaba;
    // en `contarConsultas`, no.
    const fuentes = busqueda.steps.flatMap((step) => extraerFuentes(step.providerMetadata));
    // Únicas por TÍTULO y no por URL, y eso es una corrección de honestidad.
    // Google reporta el dominio como título, así que una búsqueda normal trae
    // varios chunks de la misma página madre: el modelo veía entradas
    // indistinguibles y su elección entre ellas era azar. Colapsándolas, la
    // cita afirma justo lo que se puede defender: "visto en este medio".
    const unicas = [...new Map(fuentes.map((f) => [f.title, f])).values()];
    const consultas = contarConsultas(busqueda.steps);

    // Sin páginas no hay nada que citar, y sin cita no hay tendencia. Se corta
    // acá para no pagar la segunda llamada por un resultado ya vacío.
    //
    // Y esto pasa de verdad, no es defensa teórica: `google_search` es
    // discrecional. Midiendo contra la API con este mismo prompt, algunas
    // corridas vuelven sin una sola búsqueda —`toolCalls: 0`, sin
    // `groundingMetadata`— y el modelo redacta desde su entrenamiento. Prosa
    // convincente y cero procedencia, que es exactamente lo que no puede
    // pasar. Por eso la puerta es la cita y no el texto: acá se descarta
    // entero y se reintenta, en vez de publicar tendencias inventadas.
    if (unicas.length === 0) {
      await this.marcarIntento(userId, { motivo: "sin_fuentes", modelo, consultas });
      await this.liquidar(userId, cobro, "sin_resultados");
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
      await this.marcarIntento(userId, { motivo: "sin_items_citables", modelo, consultas });
      await this.liquidar(userId, cobro, "sin_resultados");
      return { userId, items: [], fuentes: unicas.length, consultas };
    }

    const ahora = new Date();
    await this.dbService.runWithTenant(userId, async (tx) => {
      await this.repo.upsert(tx, {
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
      });
      if (!cobro) return;
      // EN LA MISMA TRANSACCION que la tanda que lo justifica
      // (modelo-de-datos.md: "o se cobra y se produce el efecto, o ninguna de
      // las dos"). Cobrar aparte, despues, deja la puerta abierta a cobrar un
      // refresco que despues no se guardo.
      if (cobro.billable) {
        await this.credits.spend(tx, {
          userId,
          reason: REASON_REFRESCO,
          referenceType: REFERENCE_TYPE_REFRESCO,
          referenceId: cobro.id,
        });
      }
      await this.repo.liquidarRefresco(tx, cobro.id, cobro.billable ? "cobrado" : "gratis");
    });

    return { userId, items, fuentes: unicas.length, consultas };
  }

  /**
   * El estado del botón de "actualizar ahora".
   *
   * Lo arma la API y no la pantalla, por la regla de siempre: la web nunca ve
   * la unidad cruda del ledger. Acá se traduce a porcentaje del mes y a dos
   * booleanos que el botón puede usar tal cual.
   */
  async estadoDeRefresco(userId: string): Promise<TrendRefreshStateDto> {
    const { enVuelo, billable } = await this.dbService.runWithTenant(userId, async (tx) => {
      const [vuelo, tanda] = await Promise.all([this.repo.refrescoEnVuelo(tx), this.repo.find(tx)]);
      return { enVuelo: vuelo !== null, billable: esCobrable(tanda) };
    });

    if (!billable) {
      // Gratis: no hay nada que consultarle al ledger, y preguntarle igual
      // sería un lock por carga de pantalla.
      return { enCurso: enVuelo, disponible: !enVuelo, costoPorcentaje: 0 };
    }

    const cuota = await this.credits.getQuotaStatus(userId);
    return {
      enCurso: enVuelo,
      // Sin saldo el botón se apaga acá y no en el 402: anunciar un precio que
      // la cuenta no puede pagar y recién decírselo al hacer click es la peor
      // forma de contarlo.
      disponible: !enVuelo && cuota.rawBalance >= quoteFlatAction(REASON_REFRESCO),
      costoPorcentaje: flatActionPercentOfQuota(REASON_REFRESCO, cuota.tier),
    };
  }

  /**
   * Pide un refresco adelantado y lo deja encolado.
   *
   * **Se cobra solo si el usuario ya tiene tendencias vigentes**, que es lo
   * único que se puede adelantar. Sin tanda, con la tanda vencida o con una
   * que no trajo nada, el refresco es gratis: cobrarle a alguien por su
   * primera entrega —o por reintentar una búsqueda que no dio resultados— es
   * cobrarle por lo que no recibió.
   *
   * No devuelve las tendencias porque todavía no existen: la búsqueda tarda
   * decenas de segundos, así que esto deja el trabajo en la cola y contesta el
   * estado. La pantalla vuelve a preguntar.
   */
  async solicitarRefresco(userId: string): Promise<TrendRefreshStateDto> {
    const contexto = await this.contextoDe(userId);
    if (!contexto) throw new NotFoundException("Aún no configuras tu voz de marca.");

    const estado = await this.estadoDeRefresco(userId);
    // Ya hay uno andando: se contesta el estado en vez de un error. Volver a
    // apretar un botón que está trabajando no es una falla del usuario.
    if (estado.enCurso) return estado;

    const billable = estado.costoPorcentaje > 0;
    // El gate ANTES de encolar: `spend` rechaza si no alcanza, pero para
    // entonces ya se habría pagado la búsqueda. Esto contesta 402 sin gastar.
    if (billable) await this.credits.assertQuotaOr402(userId, quoteFlatAction(REASON_REFRESCO));

    const id = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.abrirRefresco(tx, userId, billable),
    );
    // `null` = otro request ganó la carrera contra el índice parcial. Su
    // refresco sirve igual, así que se reporta como en curso.
    if (!id) return { ...estado, enCurso: true, disponible: false };

    const encolado = await this.boss.enqueue(
      MANUAL_REFRESH_QUEUE,
      { userId, refrescoId: id, billable },
      { singletonKey: userId, expireInSeconds: MANUAL_REFRESH_EXPIRE_SECONDS },
    );
    if (!encolado) {
      // Sin cola no va a pasar nada, y dejar la fila abierta bloquearía el
      // botón para siempre: el candado solo se suelta al liquidar.
      await this.liquidar(userId, { id, billable }, "no_encolado");
      throw new ServiceUnavailableException(
        "No pudimos poner tu actualización en cola. Inténtalo en un momento.",
      );
    }
    return { ...estado, enCurso: true, disponible: false };
  }

  /**
   * Cierra un refresco manual sin cobrarlo.
   *
   * Nunca lanza. Un fallo acá dejaría el candado puesto y el botón muerto para
   * ese usuario, que es peor que perder la anotación de cómo terminó.
   */
  private async liquidar(
    userId: string,
    cobro: CobroDeRefresco | undefined,
    outcome: string,
  ): Promise<void> {
    if (!cobro) return;
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.liquidarRefresco(tx, cobro.id, outcome),
      );
    } catch (error) {
      console.error(`[trends] no se pudo liquidar el refresco ${cobro.id}:`, error);
    }
  }

  /**
   * El handler de la cola del refresco manual.
   *
   * Envuelve a `refrescarUsuario` solo para garantizar que el candado se
   * suelte pase lo que pase: si la búsqueda truena, la fila se queda abierta y
   * el usuario no puede volver a pedir nada.
   */
  async atenderRefrescoManual(cobro: CobroDeRefresco & { userId: string }): Promise<void> {
    const { userId, ...resto } = cobro;
    try {
      await this.refrescarUsuario(userId, resto);
    } catch (error) {
      await this.liquidar(userId, resto, "error");
      throw error;
    }
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
        await this.marcarIntento(userId, { motivo: "error" });
        fallidos.push(userId);
      }
    }
    if (fallidos.length > 0) {
      throw new Error(summarizeFailures("trends.refresh", fallidos, "usuario(s)"));
    }
  }

  /**
   * Deja constancia de un intento que no produjo tendencias.
   *
   * Es un UPSERT, y ahí está la diferencia entre posponer y no hacer nada. La
   * primera versión hacía `update ... set expires_at` sin `WHERE` (el filtro
   * era el RLS), que afecta CERO filas cuando el usuario todavía no tiene
   * ninguna — que es exactamente el caso del que más importa postergar: el que
   * nunca tuvo tanda, al que el barrido pone primero. Con un error
   * reproducible (proveedor caído, `AI_MODEL_TRENDS` mal apuntado) ese usuario
   * volvía a encabezar el pase siguiente, volvía a fallar, y el job terminaba
   * en rojo todos los días sin avanzar nunca.
   *
   * **Nunca pisa una tanda buena.** Si ya había items solo se mueve el
   * vencimiento: tendencias de la semana pasada fechadas le sirven más al
   * usuario que un módulo apagado.
   */
  private async marcarIntento(
    userId: string,
    datos: { motivo: string; modelo?: { provider: string; modelName: string }; consultas?: number },
  ): Promise<void> {
    const ahora = new Date();
    const hasta = new Date(ahora.getTime() + REINTENTO_HORAS * MS_POR_HORA);
    try {
      await this.dbService.runWithTenant(userId, async (tx) => {
        const guardadas = await this.repo.find(tx);
        if (guardadas && guardadas.items.length > 0) {
          await this.repo.posponer(tx, hasta);
          return;
        }
        await this.repo.upsert(tx, {
          userId,
          items: [],
          generatedAt: ahora,
          expiresAt: hasta,
          // "ninguno" cuando ni se llegó a resolver un modelo. Es procedencia
          // del intento, y no haberlo intentado con ninguno es la verdad.
          provider: datos.modelo?.provider ?? "ninguno",
          model: datos.modelo?.modelName ?? "ninguno",
          usage: { vacio: true, motivo: datos.motivo, consultas: datos.consultas ?? 0 },
        });
      });
    } catch (error) {
      // No se relanza: quien llama ya tiene su propio resultado que reportar, y
      // no haber podido anotar el intento no cambia lo que pasó.
      console.error(`[trends] ${userId}: no se pudo registrar el intento:`, error);
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
 *
 * Solo `steps`, y esto no es un detalle: la primera versión sumaba además el
 * `providerMetadata` del resultado, que es una copia del último step, así que
 * reportaba el doble. Justo el número que existe para que las proyecciones de
 * costo dejen de ser una corazonada.
 */
function contarConsultas(steps: readonly { providerMetadata?: unknown }[]): number {
  const deUno = (raw: unknown): number => {
    const google = (raw as { google?: { groundingMetadata?: { webSearchQueries?: unknown } } })
      ?.google;
    const queries = google?.groundingMetadata?.webSearchQueries;
    return Array.isArray(queries) ? queries.length : 0;
  };
  return steps.reduce((suma, step) => suma + deUno(step.providerMetadata), 0);
}

/** Los idiomas guardados, validados. Un valor raro no apaga la búsqueda. */
function parseLangs(raw: readonly string[]): TrendLang[] {
  const langs = raw
    .map((valor) => trendLangSchema.safeParse(valor))
    .flatMap((p) => (p.success ? [p.data] : []));
  return langs.length > 0 ? langs : ["es"];
}
