import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import {
  analiticasDetalleQuerySchema,
  analiticasQuerySchema,
  type AnaliticasPublicacionDetalleDto,
  type AnaliticasPublicacionesDto,
  type AnaliticasQuery,
  type AnaliticasRedesDto,
  type AnaliticasResumenDto,
} from "@presencia/shared";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AnaliticasService } from "./analiticas.service.js";

const idSchema = z.uuid();

function parsear(query: Record<string, unknown>): AnaliticasQuery {
  const parsed = analiticasQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException("Ese periodo o esa red no son válidos.");
  return parsed.data;
}

/**
 * Analíticas (F12). Cuatro rebanadas de un mismo análisis del motor
 * (`MetricsEngineService.analizar`): ninguna calcula por su cuenta.
 */
@Controller("analiticas")
export class AnaliticasController {
  constructor(@Inject(AnaliticasService) private readonly service: AnaliticasService) {}

  /** Los cuatro números de arriba, para todas las redes o para una. */
  @Get("resumen")
  resumen(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<AnaliticasResumenDto> {
    const { periodo, red } = parsear(query);
    return this.service.resumen(user.id, periodo, red ?? null);
  }

  /** La lente "Por red": siempre todas, el filtro de red no aplica a una lista de redes. */
  @Get("redes")
  redes(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<AnaliticasRedesDto> {
    return this.service.redes(user.id, parsear(query).periodo);
  }

  /** La lente "Por publicación": todas las del periodo, sin paginar. */
  @Get("publicaciones")
  publicaciones(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<AnaliticasPublicacionesDto> {
    const { periodo, red } = parsear(query);
    return this.service.publicaciones(user.id, periodo, red ?? null);
  }

  /** El panel de detalle. Abre aunque la publicación sea más vieja que el periodo. */
  @Get("publicaciones/:cardId")
  detalle(
    @CurrentUser() user: SessionUser,
    @Param("cardId") cardId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<AnaliticasPublicacionDetalleDto> {
    if (!idSchema.safeParse(cardId).success) {
      throw new NotFoundException("No encontramos esa publicación.");
    }
    const parsed = analiticasDetalleQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException("Ese periodo no es válido.");
    return this.service.detalle(user.id, cardId, parsed.data.periodo);
  }
}
