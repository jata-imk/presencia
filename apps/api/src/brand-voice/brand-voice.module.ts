import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { BrandVoiceController } from "./brand-voice.controller.js";
import { BrandVoiceRepository } from "./brand-voice.repository.js";
import { BrandVoiceService } from "./brand-voice.service.js";
import { EjemploDeVozService } from "./ejemplo.service.js";

// AiModule y CreditsModule desde F9.7: "Ver ejemplo de tu voz" llama al
// modelo y cobra. Ninguno de los dos importa este módulo, así que no hay
// ciclo.
@Module({
  imports: [AiModule, CreditsModule],
  controllers: [BrandVoiceController],
  providers: [BrandVoiceService, BrandVoiceRepository, EjemploDeVozService],
  // ChatModule importa esto para leer la voz al ensamblar el system
  // prompt (PR 2, buildSystemPrompt).
  exports: [BrandVoiceService, BrandVoiceRepository],
})
export class BrandVoiceModule {}
