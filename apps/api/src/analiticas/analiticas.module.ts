import { Module } from "@nestjs/common";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { AnaliticasController } from "./analiticas.controller.js";
import { AnaliticasService } from "./analiticas.service.js";

// Analíticas (F12): expone los números del motor de métricas. Igual que Ritmo,
// no tiene repositorio propio: todo lo que lee de `post_metrics` y de las
// cards pasa por `MetricsEngineService` (ADR-022); de Canales solo toma el
// nombre y el estado de la cuenta de cada red. De la voz de marca solo LEE
// (los rasgos y las decisiones del hallazgo de voz); BrandVoice no importa
// Metrics, así que no hay ciclo (igual que Ritmo).
@Module({
  imports: [MetricsModule, ChannelsModule, ProfileModule, BrandVoiceModule],
  controllers: [AnaliticasController],
  providers: [AnaliticasService],
})
export class AnaliticasModule {}
