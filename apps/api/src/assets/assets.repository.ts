import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { assets, imageGenerations } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `assets` vive aquí. Sin filtro por user_id: el RLS de la
// transacción es el filtro (ADR-003), y por eso un id ajeno simplemente no
// existe para quien lo pide.

export type AssetRow = typeof assets.$inferSelect;
export type InsertAssetInput = typeof assets.$inferInsert;

/** Lo que se guarda en `assets.metadata` (jsonb, sin schema en la base). */
export interface AssetMetadata {
  width: number;
  height: number;
  /** El nombre del archivo que subió el usuario, si lo subió él. */
  originalName?: string;
  /**
   * Texto alternativo. Las generadas nacen con la descripción que se pidió;
   * las subidas, sin él (no sabemos qué muestran) hasta que el usuario lo
   * escriba.
   */
  alt?: string;
  /**
   * F10.6: esta imagen es un recorte de `croppedFrom` (el recorte del
   * carrusel). Recortar otra vez parte de la original, no del recorte: pasar
   * 4:5 → 1:1 → 4:5 regresa a la original en vez de cortar dos veces.
   */
  croppedFrom?: string;
  /** F10.9: copiada de una imagen que el creator adjuntó en el chat. */
  fromAttachmentId?: string;
}

/** Un asset con lo que se sabe de cómo nació (si lo dibujó un generador). */
export interface AssetWithOrigin {
  asset: AssetRow;
  kind: "generate" | "edit" | null;
  instruction: string | null;
  parentAssetId: string | null;
}

@Injectable()
export class AssetsRepository {
  async insert(tx: Tx, input: InsertAssetInput): Promise<AssetRow> {
    const [row] = await tx.insert(assets).values(input).returning();
    if (!row) throw new Error("No se pudo registrar el asset");
    return row;
  }

  async findById(tx: Tx, id: string): Promise<AssetRow | undefined> {
    const [row] = await tx.select().from(assets).where(eq(assets.id, id));
    return row;
  }

  /**
   * Un asset que se va a PONER en una card (F12): lo lee con `for key share`,
   * el lock más débil que choca con eliminarlo. Si Biblioteca lo está
   * eliminando, espera y no lo encuentra; si lo encuentra, el borrado espera
   * a que la card ya lo tenga puesto y lo ve como uso. Sin esto, la card se
   * podía quedar apuntando a un asset recién borrado.
   */
  async findForUse(tx: Tx, id: string): Promise<AssetRow | undefined> {
    const [row] = await tx.select().from(assets).where(eq(assets.id, id)).for("key share");
    return row;
  }

  /**
   * Para eliminar (F12): la imagen y sus recortes de carrusel, bloqueados
   * con `for update` ANTES de leer dónde se usan. Quien llama revisa que la
   * pedida venga y no sea un recorte: un recorte se va con su original.
   */
  async lockForDelete(tx: Tx, id: string): Promise<AssetRow[]> {
    return tx
      .select()
      .from(assets)
      .where(or(eq(assets.id, id), sql`${assets.metadata} ->> 'croppedFrom' = ${id}`))
      .orderBy(asc(assets.id))
      .for("update");
  }

  async deleteByIds(tx: Tx, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.delete(assets).where(inArray(assets.id, [...ids]));
  }

  /**
   * Si hay una edición en curso que parte de alguna de estas imágenes. Una
   * `pending` más vieja que `staleBefore` es de un trabajo que murió sin
   * liquidarse: no bloquea para siempre.
   */
  async isBeingEdited(tx: Tx, ids: readonly string[], staleBefore: Date): Promise<boolean> {
    if (ids.length === 0) return false;
    const [row] = await tx
      .select({ id: imageGenerations.id })
      .from(imageGenerations)
      .where(
        and(
          inArray(imageGenerations.parentAssetId, [...ids]),
          eq(imageGenerations.status, "pending"),
          gte(imageGenerations.createdAt, staleBefore),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Todas las imágenes de una card, de la más vieja a la más nueva, con su
   * origen: el historial de versiones. El join es a la izquierda porque las
   * subidas no tienen fila de generación.
   */
  async listByCard(tx: Tx, cardId: string): Promise<AssetWithOrigin[]> {
    const rows = await tx
      .select({
        asset: assets,
        kind: imageGenerations.kind,
        instruction: imageGenerations.instruction,
        parentAssetId: imageGenerations.parentAssetId,
      })
      .from(assets)
      .leftJoin(imageGenerations, eq(imageGenerations.assetId, assets.id))
      .where(eq(assets.cardId, cardId))
      .orderBy(asc(assets.createdAt));
    return rows;
  }

  /** Cambia el texto alternativo sin tocar el resto de la metadata. */
  async updateAlt(tx: Tx, id: string, alt: string): Promise<AssetRow | undefined> {
    const [row] = await tx
      .update(assets)
      .set({ metadata: sql`jsonb_set(${assets.metadata}, '{alt}', to_jsonb(${alt}::text))` })
      .where(eq(assets.id, id))
      .returning();
    return row;
  }
}
