import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import {
  cardIdParamSchema,
  generateCardImageBodySchema,
  type ImagesConfigDto,
  type PublicationCardDto,
} from "@presencia/shared";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ImageGenerationService } from "./image-generation.service.js";

// Sin prefijo de clase: una ruta cuelga de la card (`/cards/:id/images`) y la
// otra es de la app (`/images/config`), igual que CardsController.
@Controller()
export class ImagesController {
  constructor(@Inject(ImageGenerationService) private readonly service: ImageGenerationService) {}

  /** El precio que anuncia "Generar imagen" (en %) y si hay otro generador. */
  @Get("images/config")
  config(@CurrentUser() user: SessionUser): Promise<ImagesConfigDto> {
    return this.service.config(user.id);
  }

  /** "Generar imagen": encola y devuelve la card en "generando". */
  @Post("cards/:id/images")
  generate(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<PublicationCardDto> {
    const cardId = cardIdParamSchema.safeParse({ id });
    if (!cardId.success) throw new BadRequestException("El id de la publicación no es válido.");
    const parsed = generateCardImageBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Describe la imagen que quieres generar.");
    return this.service.request(user.id, cardId.data.id, parsed.data);
  }
}
