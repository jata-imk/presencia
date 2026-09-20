import { BadRequestException, Body, Controller, Get, Inject, Patch, Query } from "@nestjs/common";
import {
  ritmoHorariosQuerySchema,
  updateCadenceTargetBodySchema,
  type RitmoHorariosDto,
  type RitmoResumenDto,
  type TrendsDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { RitmoService } from "./ritmo.service.js";

@Controller("ritmo")
export class RitmoController {
  constructor(@Inject(RitmoService) private readonly service: RitmoService) {}

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

  // Siempre 200 con cuerpo, aunque no haya tendencias: no falta un recurso,
  // el módulo existe y todavía no tiene qué mostrar. Un `null` pelón acá
  // mandaba `Content-Length: 0` y el cliente tronaba al parsearlo.
  @Get("tendencias")
  tendencias(@CurrentUser() user: SessionUser): Promise<TrendsDto> {
    return this.service.tendencias(user.id);
  }

  @Patch("objetivos")
  guardarMeta(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<RitmoResumenDto> {
    const parsed = updateCadenceTargetBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Esa meta semanal no es válida.");
    return this.service.guardarMeta(user.id, parsed.data.network, parsed.data.meta);
  }
}
