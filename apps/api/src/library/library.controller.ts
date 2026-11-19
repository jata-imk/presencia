import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  ASSET_UPLOAD_MAX_BYTES,
  NETWORK_LABELS,
  libraryDeleteBodySchema,
  libraryQuerySchema,
  type LibraryAssetDetailDto,
  type LibraryAssetDto,
  type LibraryDeleteBlock,
  type LibraryDeleteResultDto,
  type LibraryPageDto,
  type LibrarySummaryDto,
} from "@presencia/shared";
import { InvalidImageError } from "../assets/image-inspect.js";
import { fileNameFrom, readRawBody } from "../assets/read-body.js";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { LibraryService } from "./library.service.js";

const idSchema = z.uuid();

/** Por qué no se eliminó, en las palabras que ve el creator (lore doc §5). */
export function blockedMessage(block: LibraryDeleteBlock): string {
  if (block.reason === "editing") {
    return "Se está editando esta imagen. Espera a que termine para eliminarla.";
  }
  return `Esta imagen está en una publicación programada de ${NETWORK_LABELS[block.network]}. Cancela la programación para eliminarla.`;
}

/**
 * Biblioteca (F12). El archivo de cada imagen se sigue sirviendo por
 * `GET /api/assets/:id/content`; esto es el listado, el detalle, la subida
 * sin card y eliminar.
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
   * "Eliminar" de varias (selección múltiple). Las bloqueadas se quedan y las
   * demás se eliminan: el resultado dice cuáles y por qué. Es un POST y no un
   * DELETE con body, que algunos proxies descartan.
   */
  @Post("delete")
  @HttpCode(200)
  removeMany(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<LibraryDeleteResultDto> {
    const parsed = libraryDeleteBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Esa selección no es válida.");
    return this.service.remove(user.id, parsed.data.ids);
  }

  /** Una imagen con su historial de versiones: el panel de detalle. */
  @Get(":id")
  async detail(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
  ): Promise<LibraryAssetDetailDto> {
    const found = idSchema.safeParse(id).success ? await this.service.detail(user.id, id) : null;
    if (!found) throw new NotFoundException("No encontramos esa imagen.");
    return found;
  }

  /**
   * "Eliminar" de una. Si no se puede (programada, editándose), 409 con el
   * porqué y qué hacer. Una que ya no existe da 204 igual: el resultado que
   * pidió el creator ya es cierto.
   */
  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<void> {
    if (!idSchema.safeParse(id).success) throw new NotFoundException("No encontramos esa imagen.");
    const result = await this.service.remove(user.id, [id]);
    const [blocked] = result.blocked;
    if (blocked) throw new ConflictException(blockedMessage(blocked));
    // Ni eliminada ni bloqueada: era un recorte de carrusel, que no es una
    // imagen de Biblioteca.
    if (result.deleted.length === 0) throw new NotFoundException("No encontramos esa imagen.");
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
