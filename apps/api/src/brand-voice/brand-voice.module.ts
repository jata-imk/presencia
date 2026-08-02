import { Module } from "@nestjs/common";
import { BrandVoiceController } from "./brand-voice.controller.js";
import { BrandVoiceRepository } from "./brand-voice.repository.js";
import { BrandVoiceService } from "./brand-voice.service.js";

@Module({
  controllers: [BrandVoiceController],
  providers: [BrandVoiceService, BrandVoiceRepository],
  // ChatModule importa esto para leer la voz al ensamblar el system
  // prompt (PR 2, buildSystemPrompt).
  exports: [BrandVoiceService, BrandVoiceRepository],
})
export class BrandVoiceModule {}
