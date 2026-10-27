import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { webReads } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `web_reads` vive aquí (F10.10). Sin filtro por user_id: el
// RLS de la transacción es el filtro (ADR-003).

export type WebReadRow = typeof webReads.$inferSelect;
export type InsertWebReadInput = typeof webReads.$inferInsert;

/** Desde otro chat, una lectura sirve de caché si es más nueva que esto. */
export const WEB_READ_CACHE_HOURS = 24;

@Injectable()
export class WebReadsRepository {
  async insert(tx: Tx, input: InsertWebReadInput): Promise<WebReadRow> {
    const [row] = await tx.insert(webReads).values(input).returning();
    if (!row) throw new Error("No se pudo registrar la lectura");
    return row;
  }

  async findById(tx: Tx, id: string): Promise<WebReadRow | undefined> {
    const [row] = await tx.select().from(webReads).where(eq(webReads.id, id));
    return row;
  }

  /** Anota un intento de describir que no salió (el chat no lo vuelve a pedir en un día). */
  async markDescribeAttempt(tx: Tx, id: string): Promise<void> {
    await tx
      .update(webReads)
      .set({ describedAt: new Date() })
      .where(and(eq(webReads.id, id), isNull(webReads.description)));
  }

  /** Guarda la descripción si todavía no la tiene. Devuelve si la guardó (para cobrar una vez). */
  async setDescription(tx: Tx, id: string, description: string): Promise<boolean> {
    const updated = await tx
      .update(webReads)
      .set({ description, describedAt: new Date() })
      .where(and(eq(webReads.id, id), isNull(webReads.description)))
      .returning({ id: webReads.id });
    return updated.length > 0;
  }

  /** La descripción de otra lectura del creator de la misma página (pedida o final), si la hay. */
  async findDescribedTwin(
    tx: Tx,
    row: Pick<WebReadRow, "id" | "url" | "finalUrl">,
  ): Promise<string | null> {
    const urls = [row.url, row.finalUrl].filter((u): u is string => Boolean(u));
    const [twin] = await tx
      .select({ description: webReads.description })
      .from(webReads)
      .where(
        and(
          ne(webReads.id, row.id),
          eq(webReads.status, "ok"),
          isNotNull(webReads.description),
          or(inArray(webReads.url, urls), inArray(webReads.finalUrl, urls)),
        ),
      )
      .orderBy(desc(webReads.createdAt))
      .limit(1);
    return twin?.description ?? null;
  }

  /** Varias por id, en la transacción del llamador (RLS: las ajenas no vienen). */
  findByIds(tx: Tx, ids: readonly string[]): Promise<WebReadRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx.select().from(webReads).where(inArray(webReads.id, ids));
  }

  /**
   * Una lectura buena de esta URL (pedida o final): la de este chat sin
   * importar cuándo (es la que ya vio la conversación), o la de otro chat de
   * menos de WEB_READ_CACHE_HOURS. Primero la de este chat, luego la más nueva.
   */
  async findCached(tx: Tx, chatId: string, url: string): Promise<WebReadRow | undefined> {
    const [row] = await tx
      .select()
      .from(webReads)
      .where(
        and(
          eq(webReads.status, "ok"),
          or(eq(webReads.url, url), eq(webReads.finalUrl, url)),
          or(
            eq(webReads.chatId, chatId),
            gt(webReads.createdAt, sql`now() - make_interval(hours => ${WEB_READ_CACHE_HOURS})`),
          ),
        ),
      )
      .orderBy(sql`${webReads.chatId} = ${chatId} desc`, desc(webReads.createdAt))
      .limit(1);
    return row;
  }
}
