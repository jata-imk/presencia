import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ASSET_UPLOAD_MAX_BYTES,
  libraryQuerySchema,
  type LibraryAssetDto,
  type LibraryPageDto,
  type LibrarySummaryDto,
} from "@presencia/shared";
import { InvalidImageError } from "../assets/image-inspect.js";
import { fileNameFrom, readRawBody } from "../assets/read-body.js";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { LibraryService } from "./library.service.js";

/**
 * Biblioteca (F12). El archivo de cada imagen se sigue sirviendo por
 * `GET /api/assets/:id/content`; esto es el listado y la subida sin card.
 */
@Controller("library")
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly service: LibraryService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<LibraryPageDto> {
    const parsed = libraryQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException("Esos filtros no son válidos.");
    return this.service.list(user.id, parsed.data);
  }

  /** Los cuatro atajos de arriba, y el total (0 = Biblioteca vacía). */
  @Get("summary")
  summary(@CurrentUser() user: SessionUser): Promise<LibrarySummaryDto> {
    return this.service.summary(user.id);
  }

  /**
   * "Subir": el archivo viaja como body crudo, con el nombre original en
   * X-File-Name, igual que "Subir propia" de una card (CardsController). Un
   * archivo por request: la web manda varios en paralelo y muestra el avance
   * de cada uno.
   */
  @Post()
  async upload(@CurrentUser() user: SessionUser, @Req() req: Request): Promise<LibraryAssetDto> {
    const data = await readRawBody(req, ASSET_UPLOAD_MAX_BYTES);
    if (data.byteLength === 0) throw new BadRequestException("No llegó ningún archivo.");
    try {
      return await this.service.upload(user.id, data, fileNameFrom(req));
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new UnsupportedMediaTypeException(
          "Solo aceptamos JPG, PNG o WebP. Prueba con otro archivo.",
        );
      }
      throw error;
    }
  }
}
