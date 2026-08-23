import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { FoldersModule } from "../folders/folders.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [AiModule, CardsModule, BrandVoiceModule, CreditsModule, FoldersModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
})
export class ChatModule {}
