import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildPostText,
  cardContentSchema,
  decisionesDeVoz,
  estadoDeVoz,
  fraseDeHallazgoDeVoz,
  RASGOS_DE_TEXTO,
  rasgoQueSeSuma,
  idDeHallazgoDeVoz,
  VENTANA_HALLAZGOS_DIAS,
  type AnaliticasHallazgoDto,
  type AnaliticasPropuestasDeVozDto,
  type DecisionesDeVoz,
  type HallazgoVozDto,
  type PropuestaDeVozDto,
  type AnaliticasConceptoDto,
  type AnaliticasCuentaDto,
  type AnaliticasHallazgosDto,
  type AnaliticasHermanaDto,
  type AnaliticasMiniaturaDto,
  type AnaliticasPublicacionDetalleDto,
  type AnaliticasPublicacionDto,
  type AnaliticasPublicacionesDto,
  type AnaliticasRedesDto,
  type AnaliticasResumenDto,
  type PeriodoAnaliticas,
  type SocialNetwork,
} from "@presencia/shared";
import { BrandVoiceRepository, type BrandVoiceRow } from "../brand-voice/brand-voice.repository.js";
import { ChannelsRepository } from "../channels/channels.repository.js";
import { DbService, type Tx } from "../db/db.service.js";
import {
  conceptosDe,
  mejoresDe,
  type ConceptoAnalizado,
  type PostAnalizado,
} from "../metrics/analisis.js";
import {
  hallazgosDe,
  hallazgosDeVoz,
  type DescartesDeVoz,
  type HallazgoVozDelMotor,
} from "../metrics/hallazgos.js";
import { MetricsEngineService, type ContextoUsuario } from "../metrics/metrics-engine.service.js";
import type { FilaPublicacionAnalizable } from "../metrics/metrics.read.repository.js";
import { ProfileRepository } from "../profile/profile.repository.js";

// Analíticas (F12, `presencia-analiticas.md`). Este servicio no calcula: pide
// al motor UN análisis por request (`analizar`) y lo rebana en la forma de
// cada endpoint. Cualquier número nuevo va al motor, no aquí (ADR-022).

/** Largo máximo del título de una fila: la tabla lo corta igual con elipsis. */
const LARGO_TITULO = 140;

type Post = PostAnalizado<FilaPublicacionAnalizable>;

@Injectable()
export class AnaliticasService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(MetricsEngineService) private readonly motor: MetricsEngineService,
    @Inject(ProfileRepository) private readonly profileRepo: ProfileRepository,
    @Inject(ChannelsRepository) private readonly channelsRepo: ChannelsRepository,
    @Inject(BrandVoiceRepository) private readonly brandVoiceRepo: BrandVoiceRepository,
  ) {}

  async resumen(
    userId: string,
    periodo: PeriodoAnaliticas,
    red: SocialNetwork | null,
  ): Promise<AnaliticasResumenDto> {
    const contexto = await this.contextoDe(userId);
    const { analisis, kpis, hayPublicaciones } = await this.dbService.runWithTenant(userId, (tx) =>
      this.motor.analizar(tx, periodo, contexto),
    );
    const numeros = kpis(red);
    return {
      periodoDias: periodo,
      red,
      ventanaReferenciaDias: analisis.ventanaReferenciaDias,
      hayPublicaciones,
      publicaciones: numeros.publicaciones,
      alcance: numeros.alcance,
      interacciones: numeros.interacciones,
      engagement: numeros.engagement,
      ultimaMedicion: analisis.ultimaMedicion?.toISOString() ?? null,
    };
  }

  async redes(userId: string, periodo: PeriodoAnaliticas): Promise<AnaliticasRedesDto> {
    const contexto = await this.contextoDe(userId);
    const { analisis, cuentas } = await this.dbService.runWithTenant(userId, async (tx) => ({
      analisis: (await this.motor.analizar(tx, periodo, contexto)).analisis,
      cuentas: await this.cuentasPorRed(tx),
    }));
    return {
      periodoDias: periodo,
      ventanaReferenciaDias: analisis.ventanaReferenciaDias,
      redes: analisis.redes.map((red) => ({
        network: red.network,
        cuenta: cuentas.get(red.network) ?? null,
        engagement: red.engagement,
        nReferencia: red.contexto.nReferencia,
        publicaciones: red.publicaciones,
        alcance: red.alcance,
        interacciones: red.interacciones,
        tendencia: red.tendencia,
      })),
    };
  }

  async publicaciones(
    userId: string,
    periodo: PeriodoAnaliticas,
    red: SocialNetwork | null,
  ): Promise<AnaliticasPublicacionesDto> {
    const contexto = await this.contextoDe(userId);
    const { analisis } = await this.dbService.runWithTenant(userId, (tx) =>
      this.motor.analizar(tx, periodo, contexto),
    );
    const enRed = (post: Post) => red === null || post.publicacion.network === red;
    const filas = analisis.posts.filter(enRed).map(publicacionDto);
    // Mejores y conceptos los decide el motor (ADR-022): aquí solo se rebanan.
    // Los conceptos se arman con TODAS las redes y después se filtran, para
    // que un concepto con Instagram siga trayendo sus hermanas de TikTok.
    return {
      periodoDias: periodo,
      red,
      publicaciones: ordenarPorLift(filas),
      mejores: mejoresDe(analisis.posts.filter(enRed)).map((post) => post.publicacion.cardId),
      conceptos: conceptosDe(analisis.posts)
        .filter((concepto) => concepto.hermanas.some(enRed))
        .map(conceptoDto),
    };
  }

  /**
   * Los hallazgos miran siempre 90 días, sin importar el selector de periodo
   * (lore doc §4): con 7 días no habría muestra nunca, y la sección
   * aparecería y desaparecería al cambiar el periodo.
   */
  async hallazgos(userId: string, red: SocialNetwork | null): Promise<AnaliticasHallazgosDto> {
    const { contexto, analisis, voz } = await this.analisisConVoz(userId);
    const decisiones = decisionesDeVoz(voz?.voiceProposalDecisions);
    const { hayMuestra, hallazgos } = hallazgosDe(
      analisis.posts,
      analisis.contextos,
      contexto.timezone,
      red,
      descartesDe(decisiones),
    );
    const notas = voz?.styleNotes ?? [];
    return {
      ventanaDias: VENTANA_HALLAZGOS_DIAS,
      red,
      hayMuestra,
      hallazgos: hallazgos.map((h): AnaliticasHallazgoDto =>
        h.tipo === "voz" ? conPropuesta(h, notas) : h,
      ),
    };
  }

  /**
   * Los hallazgos de voz como propuestas para Configuración › Voz de marca,
   * junto a las de «Aprender de mis ediciones» (lore doc de Analíticas §5).
   *
   * - Con «Aprender de mis ediciones» apagado, ninguna: ahí el interruptor
   *   manda. En Analíticas el hallazgo sigue, porque es un dato.
   * - Solo las que se pueden agregar (o que piden quitar un rasgo para
   *   caber). "Ya lo dice" no es propuesta, y "lo contradice" se queda en
   *   Analíticas, cuyo "Revisar mi voz" lleva justo aquí.
   * - Dos redes con el mismo rasgo son una tarjeta: la de mayor diferencia,
   *   con las llaves de las otras en `otrosIds` para que un "No" las anote.
   * - Si las redes no están de acuerdo (en Instagram ganó "sin emojis" y en
   *   TikTok "con emojis"), ese rasgo no se propone: la voz es una sola, y
   *   ofrecer los dos lados dejaría a «Así escribes» contradiciéndose (review
   *   del PR 9a). En Analíticas cada red sigue con su hallazgo.
   */
  async propuestasDeVoz(userId: string): Promise<AnaliticasPropuestasDeVozDto> {
    const { contexto, analisis, voz } = await this.analisisConVoz(userId);
    if (!voz?.learnFromEdits) return { propuestas: [] };
    const todos = hallazgosDeVoz(
      analisis.posts,
      analisis.contextos,
      contexto.timezone,
      descartesDe(decisionesDeVoz(voz.voiceProposalDecisions)),
    );
    return { propuestas: propuestasDeVozDe(todos, voz.styleNotes) };
  }

  async detalle(
    userId: string,
    cardId: string,
    periodo: PeriodoAnaliticas,
  ): Promise<AnaliticasPublicacionDetalleDto> {
    const contexto = await this.contextoDe(userId);
    const detalle = await this.dbService.runWithTenant(userId, (tx) =>
      this.motor.detalle(tx, cardId, periodo, contexto),
    );
    if (!detalle) throw new NotFoundException("No encontramos esa publicación.");
    const { post, hermanas } = detalle;
    const { publicacion, ultimos } = post;
    const contenido = cardContentSchema.safeParse(publicacion.content);
    return {
      ...publicacionDto(post),
      texto: contenido.success ? buildPostText(contenido.data) : "",
      metricas: {
        reach: ultimos?.reach ?? null,
        impressions: ultimos?.impressions ?? null,
        likes: ultimos?.likes ?? null,
        comments: ultimos?.comments ?? null,
        shares: ultimos?.shares ?? null,
      },
      medidoEn: ultimos?.medidoEn?.toISOString() ?? null,
      muestraDeRed: detalle.contexto.muestra,
      carpeta: publicacion.carpeta,
      chatId: publicacion.chatId,
      postUrl: publicacion.postUrl,
      enOtrasRedes: hermanas.map(hermanaDto),
    };
  }

  /**
   * La cuenta de cada red: la conectada si hay, si no la desconectada (que
   * pide "Reconectar"). Con dos conectadas en la misma red gana la más nueva,
   * que es a la que se publica hoy.
   */
  private async cuentasPorRed(tx: Tx): Promise<Map<SocialNetwork, AnaliticasCuentaDto>> {
    const activas = await this.channelsRepo.listAccounts(tx);
    const caidas = await this.channelsRepo.listDisconnectedAccounts(tx);
    const cuentas = new Map<SocialNetwork, AnaliticasCuentaDto>();
    for (const cuenta of caidas) {
      cuentas.set(cuenta.network, { nombre: cuenta.displayName, reconectar: true });
    }
    for (const cuenta of activas) {
      // `listAccounts` también trae las que están en `error`: conectadas de
      // nombre, pero sin medir, y la salida es la misma (Reconectar).
      cuentas.set(cuenta.network, {
        nombre: cuenta.displayName,
        reconectar: cuenta.status !== "active",
      });
    }
    return cuentas;
  }

  /**
   * El análisis de 90 días de los hallazgos, más la voz default: sus rasgos
   * deciden qué propone un hallazgo de voz, y sus decisiones cuáles se callan.
   * Analíticas lee la voz y nunca la escribe (el rasgo llega por el PATCH de
   * «Así escribes»). En serie: una transacción, una query a la vez.
   */
  private async analisisConVoz(userId: string) {
    const contexto = await this.contextoDe(userId);
    const { analisis, voz } = await this.dbService.runWithTenant(userId, async (tx) => {
      const resultado = await this.motor.analizar(tx, VENTANA_HALLAZGOS_DIAS, contexto);
      const fila: BrandVoiceRow | undefined = await this.brandVoiceRepo.findDefault(tx);
      return { analisis: resultado.analisis, voz: fila };
    });
    return { contexto, analisis, voz };
  }

  private async contextoDe(userId: string): Promise<ContextoUsuario> {
    // `users` no tiene RLS (Better Auth es su dueño): la lectura va fuera del
    // tenant y filtra por id, igual que en Ritmo.
    const fila = await this.profileRepo.findById(userId);
    if (!fila) throw new NotFoundException("No encontramos tu perfil.");
    return { timezone: fila.timezone, ahora: new Date() };
  }
}

/** Lo que pinta una fila: texto y miniatura salen del contenido de la card. */
export function publicacionDto(post: Post): AnaliticasPublicacionDto {
  const { publicacion } = post;
  const contenido = cardContentSchema.safeParse(publicacion.content);
  let titulo = "";
  let miniatura: AnaliticasMiniaturaDto = { assetId: null, imagenes: 0 };
  if (contenido.success) {
    const content = contenido.data;
    titulo = (
      buildPostText(content)
        .split("\n")
        .find((linea) => linea.trim()) ?? ""
    )
      .trim()
      .slice(0, LARGO_TITULO);
    miniatura = {
      assetId: content.assetIds[0] ?? null,
      // Imágenes, no slides, igual que la miniatura del Chat (CompactCard).
      imagenes:
        content.archetype !== "video_script" && content.slides ? content.assetIds.length : 0,
    };
  }
  return {
    cardId: publicacion.cardId,
    network: publicacion.network,
    archetype: publicacion.archetype,
    titulo,
    miniatura,
    publishedAt: publicacion.publishedAt.toISOString(),
    estado: post.estado,
    alcance: post.ultimos?.reach ?? null,
    interacciones: post.interacciones,
    lift: post.lift,
    groupId: publicacion.groupId,
  };
}

/** Un concepto como lo pinta la lente: el título y la fecha son de la primera. */
export function conceptoDto(
  concepto: ConceptoAnalizado<FilaPublicacionAnalizable>,
): AnaliticasConceptoDto {
  return {
    groupId: concepto.groupId,
    titulo: publicacionDto(concepto.primera).titulo,
    publishedAt: concepto.primera.publicacion.publishedAt.toISOString(),
    hermanas: concepto.hermanas.map(hermanaDto),
    mejorEn: concepto.mejorEn,
  };
}

/** Una hermana del concepto, igual en la lente que en "En otras redes" del detalle. */
function hermanaDto(post: Post): AnaliticasHermanaDto {
  return {
    cardId: post.publicacion.cardId,
    network: post.publicacion.network,
    estado: post.estado,
    lift: post.lift,
  };
}

/** Por lift, de mayor a menor; las que no tienen, al final y de la más nueva a la más vieja. */
export function ordenarPorLift(filas: AnaliticasPublicacionDto[]): AnaliticasPublicacionDto[] {
  return [...filas].sort((a, b) => {
    if (a.lift !== null && b.lift !== null && a.lift !== b.lift) return b.lift - a.lift;
    if (a.lift !== null && b.lift === null) return -1;
    if (a.lift === null && b.lift !== null) return 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

/**
 * Los "No" a hallazgos de voz: su llave y cuándo se dijeron.
 *
 * Solo el "No" calla, a diferencia de las reglas de voz viva, donde cualquier
 * decisión reinicia la cuenta. Después de "Agregar" el hallazgo sigue
 * diciendo lo que vio, ahora como "Tu voz ya lo dice" (5f del diseño); si el
 * creator quita el rasgo después, vuelve a proponerlo con lo que sigue
 * viendo, porque quitarlo no es decir "No" a esta evidencia.
 */
function descartesDe(decisiones: DecisionesDeVoz): DescartesDeVoz {
  const descartes = new Map<string, Date>();
  for (const [id, decision] of Object.entries(decisiones)) {
    if (id.startsWith("m-") && decision?.decision === "descartada") {
      descartes.set(id, new Date(decision.at));
    }
  }
  return descartes;
}

/**
 * Las propuestas de Configuración a partir de los hallazgos de voz de todas
 * las redes (ver `propuestasDeVoz`). Pura, para probarla sin base de datos.
 */
export function propuestasDeVozDe(
  todos: readonly HallazgoVozDelMotor[],
  notas: readonly string[],
): PropuestaDeVozDto[] {
  const enDesacuerdo = new Set(
    RASGOS_DE_TEXTO.filter(
      (rasgo) => new Set(todos.filter((h) => h.rasgo === rasgo).map((h) => h.ganador)).size > 1,
    ),
  );
  const candidatos = todos
    .filter((h) => !enDesacuerdo.has(h.rasgo))
    .map((h) => conPropuesta(h, notas))
    .filter((h) => h.propuesta.voz.estado === "propone" || h.propuesta.voz.estado === "lleno")
    // Estable: en un empate queda la red por nombre.
    .sort((a, b) => b.diferenciaPct - a.diferenciaPct);

  // Por rasgo y no por texto: ya no quedan dos lados del mismo rasgo.
  const porRasgo = new Map<string, { hallazgo: HallazgoVozDto; otros: string[] }>();
  for (const hallazgo of candidatos) {
    const ya = porRasgo.get(hallazgo.rasgo);
    if (ya) ya.otros.push(hallazgo.propuesta.id);
    else porRasgo.set(hallazgo.rasgo, { hallazgo, otros: [] });
  }
  return [...porRasgo.values()].map(({ hallazgo, otros }) => {
    const frase = fraseDeHallazgoDeVoz(hallazgo);
    return {
      id: hallazgo.propuesta.id,
      origen: "metricas",
      mensaje: `${frase.antes}${frase.numero}${frase.despues}`,
      rasgo: hallazgo.propuesta.rasgo,
      evidencia: [],
      otrosIds: otros,
    };
  });
}

/** El hallazgo de voz con lo que le propone a «Así escribes», contra la voz de hoy. */
function conPropuesta(hallazgo: HallazgoVozDelMotor, notas: readonly string[]): HallazgoVozDto {
  return {
    ...hallazgo,
    propuesta: {
      id: idDeHallazgoDeVoz(hallazgo.rasgo, hallazgo.ganador, hallazgo.network),
      rasgo: rasgoQueSeSuma(hallazgo.rasgo, hallazgo.ganador),
      voz: estadoDeVoz(notas, hallazgo.rasgo, hallazgo.ganador),
    },
  };
}
