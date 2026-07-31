import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { users } from "../db/schema.js";
import { DbService } from "../db/db.service.js";
import { omitUndefined } from "../db/omit-undefined.js";

export type UserRow = typeof users.$inferSelect;

export type UpdateUserPatch = Partial<{
  displayName: string;
  timezone: string;
}>;

// `users` NO tiene RLS (Better Auth es dueño — modelo-de-datos.md); es el
// único repository del repo que filtra por id explícito en el WHERE,
// porque aquí no hay política que lo haga por nosotros (contrastar con
// ChatRepository/BrandVoiceRepository, que nunca filtran por user_id).
@Injectable()
export class ProfileRepository {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async findById(userId: string): Promise<UserRow | undefined> {
    const [row] = await this.dbService.db.select().from(users).where(eq(users.id, userId));
    return row;
  }

  async update(userId: string, patch: UpdateUserPatch): Promise<UserRow> {
    const set = omitUndefined(patch);
    const [row] = await this.dbService.db
      .update(users)
      .set({ ...set, updatedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new Error("No se pudo actualizar tu perfil");
    return row;
  }

  async completeOnboarding(userId: string): Promise<UserRow> {
    const [row] = await this.dbService.db
      .update(users)
      .set({ onboardingCompletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new Error("No se pudo completar tu onboarding");
    return row;
  }
}
