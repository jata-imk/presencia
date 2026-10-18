import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { ATTACHMENT_MAX_BYTES, type AttachmentDto } from "@presencia/shared";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { fileNameFrom, readRawBody } from "../assets/read-body.js";
import { AttachmentsService } from "./attachments.service.js";

const uuidSchema = z.uuid();

/**
 * Los adjuntos del chat (F10.9). Igual que "Subir propia" de la card: el
 * archivo viaja como body crudo, con el nombre en `X-File-Name` (URI-encoded);
 * el Content-Type no decide nada, se mira el contenido.
 */
@Controller("attachments")
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly service: AttachmentsService) {}

  /** `?chatId=` si el chat ya existe; sin él, el adjunto se liga al enviar. */
  @Post()
  async upload(
    @CurrentUser() user: SessionUser,
    @Query("chatId") chatId: string | undefined,
    @Req() req: Request,
  ): Promise<AttachmentDto> {
    if (chatId !== undefined && !uuidSchema.safeParse(chatId).success) {
      throw new BadRequestException("El id del chat no es válido.");
    }
    const data = await readRawBody(req, ATTACHMENT_MAX_BYTES);
    if (data.byteLength === 0) throw new BadRequestException("No llegó ningún archivo.");
    return this.service.upload({
      userId: user.id,
      chatId: chatId ?? null,
      data,
      filename: fileNameFrom(req),
    });
  }

  /** El archivo, para la miniatura del mensaje o para abrirlo (ver AssetsController). */
  @Get(":id/content")
  async content(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!uuidSchema.safeParse(id).success) {
      throw new BadRequestException("El id del archivo no es válido.");
    }
    const found = await this.service.deliver(user.id, id);
    if (!found) throw new NotFoundException("No encontramos ese archivo.");

    const { delivery, mimeType } = found;
    if (delivery.kind === "redirect") {
      // Menos que lo que dura la URL firmada (10 min), como en assets.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.redirect(302, delivery.url);
      return;
    }
    // Los bytes de un adjunto nunca cambian.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    // Un .md o un .json se muestran como texto, nunca se interpretan como HTML.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(mimeType).send(Buffer.from(delivery.data));
  }
}
