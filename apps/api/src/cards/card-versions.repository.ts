import { Injectable } from "@nestjs/common";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { CardVersionContent, CardVersionSource } from "@presencia/shared";
import type { Tx } from "../db/db.service.js";
import { cardVersions } from "../db/schema.js";

export type CardVersionRow = typeof cardVersions.$inferSelect;

/**
 * El historial del texto de las cards (F10.5, migración 0040). Toda escritura
 * pasa con la card bloqueada (CardsRepository.lockById): así dos guardados
 * simultáneos de la misma card no pueden sacar el mismo `n`.
 */
@Injectable()
export class CardVersionsRepository {
  async latest(tx: Tx, cardId: string): Promise<CardVersionRow | undefined> {
    const [row] = await tx
      .select()
      .from(cardVersions)
      .where(eq(cardVersions.cardId, cardId))
      .orderBy(desc(cardVersions.n))
      .limit(1);
    return row;
  }

  async find(tx: Tx, cardId: string, n: number): Promise<CardVersionRow | undefined> {
    const [row] = await tx
      .select()
      .from(cardVersions)
      .where(sql`${cardVersions.cardId} = ${cardId} and ${cardVersions.n} = ${n}`);
    return row;
  }

  async list(tx: Tx, cardId: string): Promise<CardVersionRow[]> {
    return tx
      .select()
      .from(cardVersions)
      .where(eq(cardVersions.cardId, cardId))
      .orderBy(asc(cardVersions.n));
  }

  async insert(
    tx: Tx,
    input: {
      userId: string;
      cardId: string;
      n: number;
      content: CardVersionContent;
      source: CardVersionSource;
      instruction?: string | null;
      restoredFrom?: number | null;
      editSessionId?: string | null;
      createdAt?: Date;
    },
  ): Promise<CardVersionRow> {
    const [row] = await tx
      .insert(cardVersions)
      .values({
        ...input,
        ...(input.createdAt ? { updatedAt: input.createdAt } : {}),
      })
      .returning();
    if (!row) throw new Error("No se pudo guardar la versión");
    return row;
  }

  /** La misma sesión de edición sigue escribiendo su versión. */
  async updateContent(tx: Tx, id: string, content: CardVersionContent): Promise<CardVersionRow> {
    const [row] = await tx
      .update(cardVersions)
      .set({ content, updatedAt: sql`clock_timestamp()` })
      .where(eq(cardVersions.id, id))
      .returning();
    if (!row) throw new Error("No se pudo actualizar la versión");
    return row;
  }
}
