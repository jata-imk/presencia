import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module.js";
import { PublishingModule } from "../publishing/publishing.module.js";
import { CardsController } from "./cards.controller.js";
import { CardsRepository } from "./cards.repository.js";
import { CardsService } from "./cards.service.js";

@Module({
  imports: [PublishingModule, ChannelsModule],
  controllers: [CardsController],
  providers: [CardsRepository, CardsService],
  exports: [CardsRepository],
})
export class CardsModule {}
