import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramCommandsService } from "./telegram-commands.service.js";
import { TelegramConversationService } from "./telegram-conversation.service.js";
import { TelegramLinksController } from "./telegram-links.controller.js";
import { TelegramLinksRepository } from "./telegram-links.repository.js";
import { TelegramLinksService } from "./telegram-links.service.js";
import { TelegramThreadsRepository } from "./telegram-threads.repository.js";
import { TelegramWebhookController } from "./telegram-webhook.controller.js";

// El canal Telegram (F11, ADR-030). Solo en AppModule, nunca en el worker: el
// bot atiende en el mismo proceso que el turno del chat (ver TelegramBotService).
@Module({
  // F11 PR4: el turno del chat (ChatService) y la zona del creator (ProfileRepository).
  imports: [ChatModule, ProfileModule],
  controllers: [TelegramWebhookController, TelegramLinksController],
  providers: [
    TelegramLinksRepository,
    TelegramLinksService,
    TelegramCommandsService,
    TelegramThreadsRepository,
    TelegramConversationService,
    TelegramBotService,
  ],
})
export class TelegramModule {}
