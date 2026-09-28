import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { imageGenerations } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `image_generations` vive aquí. Sin filtro por user_id: el RLS
// de la transacción es el filtro (ADR-003).

export type ImageGenerationRow = typeof imageGenerations.$inferSelect;
export type InsertImageGeneration = typeof imageGenerations.$inferInsert;

@Injectable()
export class ImageGenerationsRepository {
  async insertMany(tx: Tx, rows: InsertImageGeneration[]): Promise<ImageGenerationRow[]> {
    return tx.insert(imageGenerations).values(rows).returning();
  }

  async listBatch(tx: Tx, batchId: string): Promise<ImageGenerationRow[]> {
    return tx.select().from(imageGenerations).where(eq(imageGenerations.batchId, batchId));
  }

  async settle(
    tx: Tx,
    id: string,
    result: {
      status: "succeeded" | "failed" | "blocked";
      assetId?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await tx
      .update(imageGenerations)
      .set({
        status: result.status,
        assetId: result.assetId ?? null,
        errorMessage: result.errorMessage ?? null,
        settledAt: new Date(),
      })
      .where(eq(imageGenerations.id, id));
  }
}
