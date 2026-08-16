import { Module } from "@nestjs/common";
import { PublishingModule } from "../publishing/publishing.module.js";
import { ChannelsController } from "./channels.controller.js";
import { ChannelsRepository } from "./channels.repository.js";
import { ChannelsService } from "./channels.service.js";

@Module({
  imports: [PublishingModule],
  controllers: [ChannelsController],
  providers: [ChannelsRepository, ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
