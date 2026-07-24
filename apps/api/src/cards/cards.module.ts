import { Module } from "@nestjs/common";
import { CardsRepository } from "./cards.repository.js";

@Module({
  providers: [CardsRepository],
  exports: [CardsRepository],
})
export class CardsModule {}
