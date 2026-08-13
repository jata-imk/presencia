import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard.js";
import { BrandVoiceModule } from "./brand-voice/brand-voice.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { CreditsModule } from "./credits/credits.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";
import { ProfileModule } from "./profile/profile.module.js";

@Module({
  imports: [DbModule, ChatModule, BrandVoiceModule, ProfileModule, CreditsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
