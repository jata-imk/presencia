import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard.js";
import { ChatModule } from "./chat/chat.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [DbModule, ChatModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
