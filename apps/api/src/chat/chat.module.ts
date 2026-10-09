import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { FoldersModule } from "../folders/folders.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { CardRewriteController } from "./card-rewrite.controller.js";
import { CardRewriteService } from "./card-rewrite.service.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";
import { ChatTitleService } from "./chat-title.service.js";
import { HistoryCompactionService } from "./history-compaction.service.js";

@Module({
  imports: [AiModule, CardsModule, BrandVoiceModule, CreditsModule, FoldersModule, JobsModule],
  controllers: [ChatController, CardRewriteController],
  providers: [
    ChatService,
    ChatRepository,
    CardRewriteService,
    ChatTitleService,
    HistoryCompactionService,
  ],
  // ChatJobs vive en ScheduledJobsModule, con la lista completa de colas.
  exports: [HistoryCompactionService],
})
export class ChatModule {}
