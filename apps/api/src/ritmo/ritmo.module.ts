import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { TrendsModule } from "../trends/trends.module.js";
import { NarracionService } from "./narracion.service.js";
import { RitmoController } from "./ritmo.controller.js";
import { RitmoRepository } from "./ritmo.repository.js";
import { RitmoService } from "./ritmo.service.js";

// El único módulo de F9 con controller: el motor de métricas y la caché de
// tendencias producen números sin saber quién los expone, y este los junta.
@Module({
  imports: [MetricsModule, TrendsModule, BrandVoiceModule, ProfileModule, AiModule, CreditsModule],
  controllers: [RitmoController],
  providers: [RitmoRepository, RitmoService, NarracionService],
  exports: [RitmoService],
})
export class RitmoModule {}
