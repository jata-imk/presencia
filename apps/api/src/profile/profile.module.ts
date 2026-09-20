import { Module } from "@nestjs/common";
import { ProfileController } from "./profile.controller.js";
import { ProfileRepository } from "./profile.repository.js";
import { ProfileService } from "./profile.service.js";

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  // El repositorio se exporta para Ritmo, que necesita `users.timezone`: toda
  // su agrupación por hora y por día es local, no UTC.
  exports: [ProfileRepository],
})
export class ProfileModule {}
