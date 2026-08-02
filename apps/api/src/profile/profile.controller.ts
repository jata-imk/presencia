import { BadRequestException, Body, Controller, Get, Inject, Patch, Post } from "@nestjs/common";
import { updateProfileBodySchema, type ProfileDto } from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { ProfileService } from "./profile.service.js";

@Controller("me")
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly service: ProfileService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<ProfileDto> {
    return this.service.getMe(user.id);
  }

  @Patch()
  patch(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<ProfileDto> {
    const parsed = updateProfileBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Los datos de tu perfil no son válidos.");
    return this.service.updateMe(user.id, parsed.data);
  }

  @Post("complete-onboarding")
  completeOnboarding(@CurrentUser() user: SessionUser): Promise<ProfileDto> {
    return this.service.completeOnboarding(user.id);
  }
}
