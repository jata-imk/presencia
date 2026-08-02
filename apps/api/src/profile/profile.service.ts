import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ProfileDto, UpdateProfileBody } from "@presencia/shared";
import { ProfileRepository, type UserRow } from "./profile.repository.js";

@Injectable()
export class ProfileService {
  constructor(@Inject(ProfileRepository) private readonly repo: ProfileRepository) {}

  async getMe(userId: string): Promise<ProfileDto> {
    const row = await this.repo.findById(userId);
    if (!row) throw new NotFoundException("No encontramos tu cuenta.");
    return this.toDto(row);
  }

  async updateMe(userId: string, body: UpdateProfileBody): Promise<ProfileDto> {
    const row = await this.repo.update(userId, body);
    return this.toDto(row);
  }

  // Sella el gate del onboarding (paso "Ready") — apps/web/src/routes/protected.tsx
  // redirige a /onboarding mientras onboardingCompletedAt sea null.
  async completeOnboarding(userId: string): Promise<ProfileDto> {
    const row = await this.repo.completeOnboarding(userId);
    return this.toDto(row);
  }

  private toDto(row: UserRow): ProfileDto {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      displayName: row.displayName,
      timezone: row.timezone,
      onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    };
  }
}
