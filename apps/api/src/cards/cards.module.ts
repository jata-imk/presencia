import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { PublishingModule } from "../publishing/publishing.module.js";
import { CardMediaService } from "./card-media.service.js";
import { CardsController } from "./cards.controller.js";
import { CardsRepository } from "./cards.repository.js";
import { CardsService } from "./cards.service.js";

@Module({
  imports: [PublishingModule, ChannelsModule, AssetsModule],
  controllers: [CardsController],
  providers: [CardsRepository, CardsService, CardMediaService],
  exports: [CardsRepository, CardsService],
})
export class CardsModule {}
