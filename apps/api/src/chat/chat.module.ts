import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AttachmentsModule } from "../attachments/attachments.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { FoldersModule } from "../folders/folders.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { WebModule } from "../web/web.module.js";
import { CardRewriteController } from "./card-rewrite.controller.js";
import { CardRewriteService } from "./card-rewrite.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatEvents } from "./chat-events.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";
import { ChatTitleService } from "./chat-title.service.js";
import { HistoryCompactionService } from "./history-compaction.service.js";
import { MemoryService } from "./memory.service.js";

@Module({
  imports: [
    AiModule,
    AttachmentsModule,
    CardsModule,
    BrandVoiceModule,
    CreditsModule,
    FoldersModule,
    JobsModule,
    WebModule,
  ],
  controllers: [ChatController, CardRewriteController],
  providers: [
    ChatService,
    ChatRepository,
    ChatEvents,
    CardRewriteService,
    ChatTitleService,
    HistoryCompactionService,
    MemoryService,
  ],
  // ChatJobs vive en ScheduledJobsModule, con la lista completa de colas.
  // F11: ChatService, ChatEvents y ChatRepository, para el canal Telegram
  // (TelegramModule): el turno, los títulos y crear el chat de un tema.
  exports: [HistoryCompactionService, MemoryService, ChatService, ChatEvents, ChatRepository],
})
export class ChatModule {}
