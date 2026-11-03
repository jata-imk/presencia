import { Module } from "@nestjs/common";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramCommandsService } from "./telegram-commands.service.js";
import { TelegramLinksController } from "./telegram-links.controller.js";
import { TelegramLinksRepository } from "./telegram-links.repository.js";
import { TelegramLinksService } from "./telegram-links.service.js";
import { TelegramWebhookController } from "./telegram-webhook.controller.js";

// El canal Telegram (F11, ADR-030). Solo en AppModule, nunca en el worker: el
// bot atiende en el mismo proceso que el turno del chat (ver TelegramBotService).
@Module({
  controllers: [TelegramWebhookController, TelegramLinksController],
  providers: [
    TelegramLinksRepository,
    TelegramLinksService,
    TelegramCommandsService,
    TelegramBotService,
  ],
})
export class TelegramModule {}
