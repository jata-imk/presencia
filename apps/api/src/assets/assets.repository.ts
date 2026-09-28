import { Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
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
