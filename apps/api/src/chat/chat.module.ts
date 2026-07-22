import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [AiModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
})
export class ChatModule {}
