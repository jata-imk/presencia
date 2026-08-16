import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  cardIdParamSchema,
  chatIdParamSchema,
  conflictsQuerySchema,
  scheduleCardBodySchema,
  scheduleGroupBodySchema,
  type PublicationCardDto,
  type ScheduleGroupResultItem,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { CardsService } from "./cards.service.js";

// Sin prefijo de clase: las rutas viven en dos namespaces distintos
// (/chats/:chatId/cards, propiedad de ChatController en su dominio; y
// /cards/..., el ciclo de vida propio). Cada método declara su path completo.
@Controller()
export class CardsController {
  constructor(@Inject(CardsService) private readonly service: CardsService) {}

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

  private parseCardId(id: string): string {
    const parsed = cardIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la publicación no es válido.");
    return parsed.data.id;
  }
}
