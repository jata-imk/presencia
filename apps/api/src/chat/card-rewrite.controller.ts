import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  cardIdParamSchema,
  rewriteCardBodySchema,
  type CardContentChangeDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { CardRewriteService } from "./card-rewrite.service.js";

// "Pide un cambio a este borrador" (F10.5 PR4). Vive en el módulo de chat y
// no en el de cards porque necesita la conversación donde nació la card.
@Controller()
export class CardRewriteController {
  constructor(@Inject(CardRewriteService) private readonly service: CardRewriteService) {}

  @Post("cards/:id/rewrite")
  rewrite(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CardContentChangeDto> {
    const params = cardIdParamSchema.safeParse({ id });
    if (!params.success) throw new BadRequestException("El id de la publicación no es válido.");
    const parsed = rewriteCardBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Escribe qué quieres cambiar.");

    // "Detener" en el navegador cancela el fetch: la conexión se cierra antes
    // de responder y la llamada al modelo se aborta. Sin respuesta no hay
    // versión ni cobro (ver CardRewriteService).
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });
    return this.service.rewrite(user.id, params.data.id, parsed.data.instruction, abort.signal);
  }

  /**
   * "Detener", explícito: el cierre de la conexión no siempre llega al
   * servidor detrás de un proxy (ver CardRewriteService.running).
   */
  @Delete("cards/:id/rewrite")
  @HttpCode(204)
  cancel(@CurrentUser() user: SessionUser, @Param("id") id: string): void {
    const params = cardIdParamSchema.safeParse({ id });
    if (!params.success) throw new BadRequestException("El id de la publicación no es válido.");
    this.service.cancel(user.id, params.data.id);
  }
}
