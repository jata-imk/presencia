import { Module } from "@nestjs/common";
import { CardsRepository } from "../cards/cards.repository.js";
import { PublishingModule } from "../publishing/publishing.module.js";
import { ChannelsController } from "./channels.controller.js";
import { ChannelsRepository } from "./channels.repository.js";
import { ChannelsService } from "./channels.service.js";

@Module({
  imports: [PublishingModule],
  controllers: [ChannelsController],
  // CardsRepository acá directo, no vía CardsModule: CardsModule ya
  // importa ChannelsModule (para validar la cuenta destino al programar)
  // — importarlo de vuelta sería un ciclo de módulos. CardsRepository no
  // tiene dependencias propias inyectadas (solo métodos que reciben `tx`),
  // así que una segunda instancia acá es inofensiva, no comparte estado.
  providers: [ChannelsRepository, ChannelsService, CardsRepository],
  exports: [ChannelsService, ChannelsRepository],
})
export class ChannelsModule {}
