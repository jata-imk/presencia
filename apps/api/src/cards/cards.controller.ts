import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ASSET_UPLOAD_MAX_BYTES,
  cardIdParamSchema,
  chatIdParamSchema,
  conflictsQuerySchema,
  listCardsQuerySchema,
  scheduleCardBodySchema,
  scheduleGroupBodySchema,
  type PublicationCardDto,
  type ScheduleGroupResultItem,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { readRawBody } from "../assets/read-body.js";
import { CardMediaService } from "./card-media.service.js";
import { CardsService } from "./cards.service.js";

// Sin prefijo de clase: las rutas viven en dos namespaces distintos
// (/chats/:chatId/cards, propiedad de ChatController en su dominio; y
// /cards/..., el ciclo de vida propio). Cada método declara su path completo.
@Controller()
export class CardsController {
  constructor(
    @Inject(CardsService) private readonly service: CardsService,
    @Inject(CardMediaService) private readonly media: CardMediaService,
  ) {}

  @Get("chats/:chatId/cards")
  listByChat(
    @CurrentUser() user: SessionUser,
    @Param("chatId") chatId: string,
  ): Promise<PublicationCardDto[]> {
    const parsed = chatIdParamSchema.safeParse({ id: chatId });
    if (!parsed.success) throw new BadRequestException("El id del chat no es válido.");
    return this.service.listByChat(user.id, parsed.data.id);
  }

  @Get("cards/conflicts")
  conflicts(
    @CurrentUser() user: SessionUser,
    @Query() query: unknown,
  ): Promise<PublicationCardDto[]> {
    const parsed = conflictsQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException("El rango de fechas no es válido.");
    return this.service.findConflicts(
      user.id,
      new Date(parsed.data.from),
      new Date(parsed.data.to),
    );
  }

  // F7 (Calendario). Va ANTES de las rutas con parámetro por prolijidad, no
  // por necesidad: "cards/drafts" y "cards/conflicts" son literales y Nest ya
  // los prioriza sobre un ":id" del mismo verbo. Si algún día aparece un
  // GET cards/:id, el orden pasa a importar de verdad.
  @Get("cards/drafts")
  drafts(@CurrentUser() user: SessionUser): Promise<PublicationCardDto[]> {
    return this.service.listDrafts(user.id);
  }

  @Get("cards")
  list(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<PublicationCardDto[]> {
    const parsed = listCardsQuerySchema.safeParse(query);
    if (!parsed.success) {
      // Solo los issues `custom` son nuestros refine (rango invertido /
      // demasiado amplio) y ya vienen redactados en español. Los demás son
      // mensajes de Zod en inglés ("Invalid ISO datetime"): no se le
      // muestran al usuario, caen al genérico.
      const issue = parsed.error.issues[0];
      throw new BadRequestException(
        issue?.code === "custom" ? issue.message : "Los filtros del calendario no son válidos.",
      );
    }
    const { from, to, ...filters } = parsed.data;
    return this.service.listByRange(user.id, new Date(from), new Date(to), filters);
  }

  @Post("cards/:id/schedule")
  schedule(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PublicationCardDto> {
    const cardId = this.parseCardId(id);
    const parsedBody = scheduleCardBodySchema.safeParse(body);
    if (!parsedBody.success)
      throw new BadRequestException("Los datos de programación no son válidos.");
    return this.service.schedule(user.id, cardId, parsedBody.data);
  }

  @Post("cards/schedule-group")
  scheduleGroup(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<ScheduleGroupResultItem[]> {
    const parsed = scheduleGroupBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Los datos de programación no son válidos.");
    return this.service.scheduleGroup(user.id, parsed.data);
  }

  @Post("cards/:id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<PublicationCardDto> {
    return this.service.cancelSchedule(user.id, this.parseCardId(id));
  }

  /**
   * "Subir propia" (F10): el archivo viaja como body crudo, con su tipo en
   * Content-Type y el nombre original en X-File-Name (URI-encoded, porque un
   * header no admite acentos). El tipo declarado no se usa para decidir nada:
   * sharp mira los bytes.
   */
  @Post("cards/:id/assets")
  async uploadImage(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<PublicationCardDto> {
    const cardId = this.parseCardId(id);
    const data = await readRawBody(req, ASSET_UPLOAD_MAX_BYTES);
    if (data.byteLength === 0) throw new BadRequestException("No llegó ningún archivo.");
    return this.media.attachUpload(user.id, cardId, data, fileNameFrom(req));
  }

  private parseCardId(id: string): string {
    const parsed = cardIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la publicación no es válido.");
    return parsed.data.id;
  }
}

/** El nombre original del archivo, o nada si no vino o no se puede leer. */
function fileNameFrom(req: Request): string | undefined {
  const raw = req.headers["x-file-name"];
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return decodeURIComponent(raw).slice(0, 255);
  } catch {
    return undefined;
  }
}
