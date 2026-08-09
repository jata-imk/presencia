import { Module } from "@nestjs/common";
import { AiUsageRepository } from "./ai-usage.repository.js";
import { AiService } from "./ai.service.js";

@Module({
  providers: [AiService, AiUsageRepository],
  exports: [AiService, AiUsageRepository],
})
export class AiModule {}
