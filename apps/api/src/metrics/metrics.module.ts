import { Module } from "@nestjs/common";
import { CardsModule } from "../cards/cards.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { PublishingModule } from "../publishing/publishing.module.js";
import { MetricsEngineService } from "./metrics-engine.service.js";
import { MetricsReadRepository } from "./metrics.read.repository.js";
import { MetricsRepository } from "./metrics.repository.js";
import { MetricsService } from "./metrics.service.js";

// Sigue sin controller, y eso es a propósito: este módulo produce números, no
// respuestas HTTP. F8.7 dejó la escritura (`MetricsService` + el job) y F9
// suma la lectura (`MetricsEngineService`), que es la fuente única de la
// fórmula. Quien exponga los números decide su propia forma de contrato —
// Ritmo primero, Analíticas después— sin que el motor tenga que saberlo.
@Module({
  imports: [CardsModule, ChannelsModule, PublishingModule],
  providers: [MetricsRepository, MetricsReadRepository, MetricsService, MetricsEngineService],
  exports: [MetricsService, MetricsRepository, MetricsEngineService],
})
export class MetricsModule {}
