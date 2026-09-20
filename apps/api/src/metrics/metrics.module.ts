import { Module } from "@nestjs/common";
import { CardsModule } from "../cards/cards.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { PublishingModule } from "../publishing/publishing.module.js";
import { MetricsRepository } from "./metrics.repository.js";
import { MetricsService } from "./metrics.service.js";

// Sin controller: F8.7 no expone nada por HTTP. La UI de Analíticas es F12, y
// hasta entonces esta tabla solo la escribe el job.
@Module({
  imports: [CardsModule, ChannelsModule, PublishingModule],
  providers: [MetricsRepository, MetricsService],
  exports: [MetricsService, MetricsRepository],
})
export class MetricsModule {}
