import { Module } from "@nestjs/common";
import { CardsModule } from "../cards/cards.module.js";
import { CardListener } from "./card-listener.service.js";
import { StreamController } from "./stream.controller.js";
import { StreamRegistry } from "./stream-registry.service.js";

// Stream de eventos al navegador (F8.6). Solo en AppModule: el worker no
// tiene HTTP ni conexiones que atender. El worker sí EMITE (sus escrituras
// pasan por cards.repository.ts), y este módulo lo escucha desde la API.
@Module({
  imports: [CardsModule],
  controllers: [StreamController],
  providers: [StreamRegistry, CardListener],
})
export class RealtimeModule {}
