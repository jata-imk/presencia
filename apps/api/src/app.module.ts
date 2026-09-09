import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard.js";
import { BrandVoiceModule } from "./brand-voice/brand-voice.module.js";
import { ChannelsModule } from "./channels/channels.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { CreditsModule } from "./credits/credits.module.js";
import { DbModule } from "./db/db.module.js";
import { env } from "./env.js";
import { FoldersModule } from "./folders/folders.module.js";
import { HealthController } from "./health.controller.js";
import { ScheduledJobsModule } from "./jobs/scheduled-jobs.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { SearchModule } from "./search/search.module.js";

@Module({
  imports: [
    DbModule,
    ChatModule,
    BrandVoiceModule,
    ProfileModule,
    CreditsModule,
    ChannelsModule,
    FoldersModule,
    SearchModule,
    // WORKER_INLINE: en dev la cola vive en este mismo proceso (ADR-008
    // addendum F8). Con el flag apagado, quien la consume es worker.ts.
    ...(env.WORKER_INLINE ? [ScheduledJobsModule] : []),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
