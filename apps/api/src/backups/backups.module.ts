import { Module } from "@nestjs/common";
import { BackupsService } from "./backups.service.js";

@Module({
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
