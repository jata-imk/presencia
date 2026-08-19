import { Injectable } from "@nestjs/common";
import { eq, ne } from "drizzle-orm";
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
  // "active" + "error" (nunca asignado hoy, pero un problema real que no
  // se debe esconder si algún día se usa) — "disconnected" vive aparte en
  // listDisconnectedAccounts, mismo patrón que ChatRepository.listChats/
  // listArchivedChats.
  async listAccounts(tx: Tx): Promise<SocialAccountRow[]> {
    return tx
      .select()
      .from(socialAccounts)
      .where(ne(socialAccounts.status, "disconnected"))
      .orderBy(socialAccounts.createdAt);
  }

  async listDisconnectedAccounts(tx: Tx): Promise<SocialAccountRow[]> {
    return tx
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.status, "disconnected"))
      .orderBy(socialAccounts.createdAt);
  }

  async findAccountById(tx: Tx, id: string): Promise<SocialAccountRow | undefined> {
    const [row] = await tx.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    return row;
  }

  /**
   * providerRef es único a nivel de TODO el workspace (índice global, no por
   * tenant — ver comentario de schema.ts), así que esta query sin filtro
   * explícito de user_id depende enteramente de RLS: si la fila es de otro
   * tenant, la transacción no la ve y esto regresa undefined — exactamente
   * el comportamiento que claimConnectIntent necesita para distinguir "esta
   * cuenta ya es mía" de "otro usuario se la quedó primero".
   */
  async findAccountByProviderRef(
    tx: Tx,
    providerRef: string,
  ): Promise<SocialAccountRow | undefined> {
    const [row] = await tx
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.providerRef, providerRef));
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

  // Borrado permanente (F6 follow-up) — a diferencia de disconnectAccount
  // (soft, reversible vía reactivateAccount), esto sí borra la fila.
  // Seguro para el schema: social_account_id en publication_cards es
  // "set null" (ver comentario en schema.ts), el guard de cards
  // "scheduled" vive en ChannelsService antes de llegar acá.
  async deleteAccount(tx: Tx, id: string): Promise<void> {
    await tx.delete(socialAccounts).where(eq(socialAccounts.id, id));
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
