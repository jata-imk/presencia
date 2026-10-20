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
import { attachmentDisposition } from "../assets/asset-storage.js";
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
    // El cuerpo primero: rechazar antes de leerlo corta la subida en el proxy
    // y el navegador ve un error de red en vez del motivo (read-body.ts).
    const data = await readRawBody(req, ATTACHMENT_MAX_BYTES);
    if (chatId !== undefined && !uuidSchema.safeParse(chatId).success) {
      throw new BadRequestException("El id del chat no es válido.");
    }
    if (data.byteLength === 0) throw new BadRequestException("No llegó ningún archivo.");
    return this.service.upload({
      userId: user.id,
      chatId: chatId ?? null,
      data,
      filename: fileNameFrom(req),
    });
  }

  /**
   * F10.9: las imágenes que el creator ya envió en un chat
   * (`?chatId=…&kind=image`): el selector "Usar una que adjuntaste" de la card.
   */
  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("chatId") chatId: string | undefined,
    @Query("kind") kind: string | undefined,
  ): Promise<AttachmentDto[]> {
    if (!chatId || !uuidSchema.safeParse(chatId).success || kind !== "image") {
      throw new BadRequestException("Pide las imágenes de un chat: ?chatId=…&kind=image.");
    }
    return this.service.sentImagesOfChat(user.id, chatId);
  }

  /**
   * F10.9: el texto extraído de un adjunto (.md, .txt, .csv, .json, PDF con
   * texto), para la vista del chat. Ver AttachmentsService.readText.
   */
  @Get(":id/text")
  async text(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
  ): Promise<{ text: string; truncated: boolean; filename: string }> {
    if (!uuidSchema.safeParse(id).success) {
      throw new BadRequestException("El id del archivo no es válido.");
    }
    const found = await this.service.readText(user.id, id);
    if (!found) throw new NotFoundException("No encontramos el texto de ese archivo.");
    return found;
  }

  /** El archivo, para la miniatura del mensaje o para abrirlo (ver AssetsController). */
  @Get(":id/content")
  async content(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!uuidSchema.safeParse(id).success) {
      throw new BadRequestException("El id del archivo no es válido.");
    }
    // `?download=1`: para guardarlo (el botón Descargar), no para mostrarlo.
    const toSave = download === "1";
    const found = await this.service.deliver(user.id, id, toSave);
    if (!found) throw new NotFoundException("No encontramos ese archivo.");

    const { delivery, mimeType, filename } = found;
    if (toSave && delivery.kind === "bytes") {
      res.setHeader("Content-Disposition", attachmentDisposition(filename));
    }
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
