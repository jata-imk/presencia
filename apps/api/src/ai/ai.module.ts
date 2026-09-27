import { Module } from "@nestjs/common";
import { AiUsageRepository } from "./ai-usage.repository.js";
import { AiUsageService } from "./ai-usage.service.js";
import { AiService } from "./ai.service.js";

@Module({
  providers: [AiService, AiUsageRepository, AiUsageService],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
