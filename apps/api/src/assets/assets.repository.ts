import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { assets } from "../db/schema.js";
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
}
