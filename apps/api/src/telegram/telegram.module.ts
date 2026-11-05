import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { TranscriptionModule } from "../transcription/transcription.module.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramChatsController } from "./telegram-chats.controller.js";
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
  // F11 PR5: las fotos y los archivos entran como adjuntos (AttachmentsService).
  // F11 PR6: las notas de voz se transcriben (TranscriptionService).
  imports: [ChatModule, ProfileModule, AttachmentsModule, TranscriptionModule],
  // F11 PR7b: "Continuar en Telegram" (TelegramChatsController).
  controllers: [TelegramWebhookController, TelegramLinksController, TelegramChatsController],
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
