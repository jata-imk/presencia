import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildPostText,
  cardContentSchema,
  type AnaliticasCuentaDto,
  type AnaliticasMiniaturaDto,
  type AnaliticasPublicacionDetalleDto,
  type AnaliticasPublicacionDto,
  type AnaliticasPublicacionesDto,
  type AnaliticasRedesDto,
  type AnaliticasResumenDto,
  type PeriodoAnaliticas,
  type SocialNetwork,
} from "@presencia/shared";
import { ChannelsRepository } from "../channels/channels.repository.js";
import { DbService, type Tx } from "../db/db.service.js";
import type { PostAnalizado } from "../metrics/analisis.js";
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
    const filas = analisis.posts
      .filter((post) => red === null || post.publicacion.network === red)
      .map(publicacionDto);
    return { periodoDias: periodo, red, publicaciones: ordenarPorLift(filas) };
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
      enOtrasRedes: hermanas.map((hermana) => ({
        cardId: hermana.publicacion.cardId,
        network: hermana.publicacion.network,
        estado: hermana.estado,
        lift: hermana.lift,
      })),
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
      cuentas.set(cuenta.network, { nombre: cuenta.displayName, reconectar: false });
    }
    return cuentas;
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

/** Por lift, de mayor a menor; las que no tienen, al final y de la más nueva a la más vieja. */
export function ordenarPorLift(filas: AnaliticasPublicacionDto[]): AnaliticasPublicacionDto[] {
  return [...filas].sort((a, b) => {
    if (a.lift !== null && b.lift !== null && a.lift !== b.lift) return b.lift - a.lift;
    if (a.lift !== null && b.lift === null) return -1;
    if (a.lift === null && b.lift !== null) return 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}
