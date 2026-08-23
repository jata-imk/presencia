import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { SocialNetwork } from "@presencia/shared";
import { socialAccounts, socialConnectIntents } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a social_accounts / social_connect_intents vive aquí (patrón
// de CardsRepository / CreditsRepository). Las queries no filtran por
// user_id: el RLS de la transacción es el filtro.

export type SocialAccountRow = typeof socialAccounts.$inferSelect;
export type SocialConnectIntentRow = typeof socialConnectIntents.$inferSelect;

export interface InsertAccountInput {
  userId: string;
  network: SocialNetwork;
  providerRef: string;
  displayName: string | null;
}

export interface InsertIntentInput {
  userId: string;
  knownAccountRefs: string[];
  expiresAt: Date;
}

@Injectable()
export class ChannelsRepository {
  async listAccounts(tx: Tx): Promise<SocialAccountRow[]> {
    return tx.select().from(socialAccounts).orderBy(socialAccounts.createdAt);
  }

  async findAccountById(tx: Tx, id: string): Promise<SocialAccountRow | undefined> {
    const [row] = await tx.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    return row;
  }

  async insertAccount(tx: Tx, input: InsertAccountInput): Promise<SocialAccountRow> {
    const [row] = await tx
      .insert(socialAccounts)
      .values({ ...input, status: "active" })
      .returning();
    if (!row) throw new Error("No se pudo guardar la cuenta conectada");
    return row;
  }

  async reactivateAccount(
    tx: Tx,
    id: string,
    displayName: string | null,
  ): Promise<SocialAccountRow> {
    const [row] = await tx
      .update(socialAccounts)
      .set({ displayName, status: "active", updatedAt: new Date() })
      .where(eq(socialAccounts.id, id))
      .returning();
    if (!row) throw new Error("No se pudo reconectar la cuenta");
    return row;
  }

  async disconnectAccount(tx: Tx, id: string): Promise<void> {
    await tx
      .update(socialAccounts)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(socialAccounts.id, id));
  }

  async insertIntent(tx: Tx, input: InsertIntentInput): Promise<SocialConnectIntentRow> {
    const [row] = await tx
      .insert(socialConnectIntents)
      .values({
        userId: input.userId,
        knownAccountRefs: input.knownAccountRefs,
        expiresAt: input.expiresAt,
      })
      .returning();
    if (!row) throw new Error("No se pudo iniciar la conexión de canal");
    return row;
  }

  async findIntentById(tx: Tx, id: string): Promise<SocialConnectIntentRow | undefined> {
    const [row] = await tx
      .select()
      .from(socialConnectIntents)
      .where(eq(socialConnectIntents.id, id));
    return row;
  }

  async consumeIntent(tx: Tx, id: string): Promise<void> {
    await tx
      .update(socialConnectIntents)
      .set({ consumedAt: new Date() })
      .where(eq(socialConnectIntents.id, id));
  }
}
