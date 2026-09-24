import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ritmoHorariosQuerySchema,
  ritmoVentanasQuerySchema,
  updateCadenceTargetBodySchema,
  type RitmoHorariosDto,
  type RitmoMetaDto,
  type RitmoNarracionDto,
  type RitmoResumenDto,
  type VentanaDeRedDto,
  type TrendsDto,
  type TrendRefreshStateDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { NarracionService } from "./narracion.service.js";
import { RitmoService } from "./ritmo.service.js";
import { TrendsService } from "../trends/trends.service.js";

@Controller("ritmo")
export class RitmoController {
  constructor(
    @Inject(RitmoService) private readonly service: RitmoService,
    @Inject(NarracionService) private readonly narraciones: NarracionService,
    @Inject(TrendsService) private readonly trends: TrendsService,
  ) {}

  @Get("resumen")
  resumen(@CurrentUser() user: SessionUser): Promise<RitmoResumenDto> {
    return this.service.resumen(user.id);
  }

  // Una red por llamada, y no todas juntas: la pantalla muestra una pestaña a
  // la vez, y calcular las siete para pintar una sería pagar seis veces por
  // datos que nadie va a mirar.
  @Get("horarios")
  horarios(
    @CurrentUser() user: SessionUser,
    @Query("network") network: string,
  ): Promise<RitmoHorariosDto> {
    const parsed = ritmoHorariosQuerySchema.safeParse({ network });
    if (!parsed.success) throw new BadRequestException("Esa red social no existe.");
    return this.service.horarios(user.id, parsed.data.network);
  }

  // Caché vacía = 200 con cuerpo, no 404: no falta un recurso, el módulo
  // existe y todavía no tiene qué mostrar. Un `null` pelón acá mandaba
  // `Content-Length: 0` y el cliente tronaba al parsearlo. (Sí hay un 404,
  // pero por otra cosa: quien no terminó el onboarding no tiene voz de marca
  // y por lo tanto no tiene nicho del cual buscar.)
  // Las ventanas de un día, de todas las redes. Vive aparte de /horarios
  // porque responde otra pregunta: aquél es "cómo te va en esta red", éste es
  // "cuándo publico este día". Y en un solo viaje porque quien lo pide es un
  // estado vacío del Calendario, que no es de una red en particular.
  @Get("ventanas")
  ventanas(
    @CurrentUser() user: SessionUser,
    @Query("diaSemana") diaSemana: string,
  ): Promise<VentanaDeRedDto[]> {
    const parsed = ritmoVentanasQuerySchema.safeParse({ diaSemana });
    if (!parsed.success) throw new BadRequestException("Ese día de la semana no existe.");
    return this.service.ventanas(user.id, parsed.data.diaSemana);
  }

  @Get("tendencias")
  tendencias(@CurrentUser() user: SessionUser): Promise<TrendsDto> {
    return this.service.tendencias(user.id);
  }

  // POST por la misma razón que la narración: esto puede cobrar, y un GET que
  // cobra es un GET que un prefetch o un reintento del navegador disparan
  // solos. No devuelve tendencias porque todavía no existen —la búsqueda
  // tarda decenas de segundos—: devuelve el estado, y la pantalla vuelve a
  // pedir el GET de arriba mientras `enCurso` siga en true.
  @Post("tendencias/refresco")
  refrescarTendencias(@CurrentUser() user: SessionUser): Promise<TrendRefreshStateDto> {
    return this.trends.solicitarRefresco(user.id);
  }

  // Sin el avance de la semana: quien lo pide (la barra del Calendario) ya
  // tiene el numerador delante en sus propias cards.
  @Get("objetivos")
  metas(@CurrentUser() user: SessionUser): Promise<RitmoMetaDto[]> {
    return this.service.metas(user.id);
  }

  // POST y no GET aunque a veces solo devuelva lo guardado: la primera del día
  // llama al modelo y cobra. Un GET que cobra es un GET que un prefetch, un
  // reintento del navegador o un crawler pueden disparar solos.
  @Post("narracion")
  narracion(@CurrentUser() user: SessionUser): Promise<RitmoNarracionDto> {
    return this.narraciones.narrar(user.id);
  }

  @Patch("objetivos")
  guardarMeta(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<RitmoResumenDto> {
    const parsed = updateCadenceTargetBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Esa meta semanal no es válida.");
    return this.service.guardarMeta(user.id, parsed.data.network, parsed.data.meta);
  }
}
