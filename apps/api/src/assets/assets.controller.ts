import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { cardIdParamSchema } from "@presencia/shared";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetsService } from "./assets.service.js";

/**
 * `GET /api/assets/:id/content`: el archivo de un asset (F10). Es el `src`
 * de las imágenes de la card, y por eso va por el guard global con la cookie
 * de sesión: el `<img>` la manda sola por ser el mismo origen (ADR-020).
 *
 * Con R2 responde un 302 a una URL firmada del bucket en vez de pasar los
 * bytes por la API: el bucket sirve la imagen y el proceso de Node no carga
 * con megas por cada card que se pinta.
 */
@Controller("assets")
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly service: AssetsService) {}

  @Get(":id/content")
  async content(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = cardIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la imagen no es válido.");

    const found = await this.service.deliver(user.id, parsed.data.id);
    if (!found) throw new NotFoundException("No encontramos esa imagen.");

    const { delivery, mimeType } = found;
    if (delivery.kind === "redirect") {
      // Menos que lo que dura la URL firmada (10 min): el navegador reusa la
      // redirección un rato sin volver a pedirla, y nunca guarda una que ya
      // venció.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.redirect(302, delivery.url);
      return;
    }
    // Los bytes de un asset nunca cambian: una imagen nueva es un asset nuevo.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.type(mimeType).send(Buffer.from(delivery.data));
  }
}
