import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { TelegramLinkDto, TelegramLinkStatusDto } from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { copy } from "./telegram.copy.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramLinksService } from "./telegram-links.service.js";

// Conectar y desconectar Telegram desde Configuración → Canales conectados
// (F11, ADR-030). Con sesión: cada creator solo ve y toca su vínculo.

@Controller("telegram/link")
export class TelegramLinksController {
  constructor(
    @Inject(TelegramLinksService) private readonly links: TelegramLinksService,
    @Inject(TelegramBotService) private readonly bot: TelegramBotService,
  ) {}

  @Get()
  async status(@CurrentUser() user: SessionUser): Promise<TelegramLinkStatusDto> {
    if (!this.bot.enabled) {
      return {
        state: "unavailable",
        username: null,
        linkedAt: null,
        expiresAt: null,
        botUsername: null,
      };
    }
    return this.links.status(user.id, this.bot.username);
  }

  /** Genera el enlace de un solo uso (deep link a `/start <código>`). */
  @Post()
  async create(@CurrentUser() user: SessionUser): Promise<TelegramLinkDto> {
    const botUsername = this.bot.username;
    if (!botUsername) {
      throw new ServiceUnavailableException(
        "Telegram no está disponible ahora. Inténtalo en un rato.",
      );
    }
    return this.links.createLink(user.id, botUsername);
  }

  /** Desconecta (o cancela un enlace pendiente). Los chats se quedan. */
  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser): Promise<void> {
    const externalId = await this.links.unlink(user.id);
    // Que el Telegram se entere: en un chat privado, el id del usuario es el del chat.
    if (externalId) await this.bot.notify(Number(externalId), copy.unlinkedFromWeb);
  }
}
