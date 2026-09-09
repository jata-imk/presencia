import { Module } from "@nestjs/common";
import { CreditsController } from "./credits.controller.js";
import { CreditsRepository } from "./credits.repository.js";
import { CreditsService } from "./credits.service.js";

@Module({
  controllers: [CreditsController],
  providers: [CreditsRepository, CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
