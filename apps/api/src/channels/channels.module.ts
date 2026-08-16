import { Module } from "@nestjs/common";
import { PublishingModule } from "../publishing/publishing.module.js";
import { ChannelsController } from "./channels.controller.js";
import { ChannelsRepository } from "./channels.repository.js";
import { ChannelsService } from "./channels.service.js";

@Module({
  imports: [PublishingModule],
  controllers: [ChannelsController],
  providers: [ChannelsRepository, ChannelsService],
  // CardsModule importa esto para validar la cuenta destino al programar
  // (CardsService.schedule) sin duplicar la lógica de acceso a
  // social_accounts.
  exports: [ChannelsService, ChannelsRepository],
})
export class ChannelsModule {}
