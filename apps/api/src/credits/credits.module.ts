import { Module } from "@nestjs/common";
import { CreditsRepository } from "./credits.repository.js";
import { CreditsService } from "./credits.service.js";

@Module({
  providers: [CreditsRepository, CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
