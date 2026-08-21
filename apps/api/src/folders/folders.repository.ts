import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { folders } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a folders vive aquí (patrón de ChatRepository/CardsRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro
// (tenant_isolation, migración 0001).

export type FolderRow = typeof folders.$inferSelect;

@Injectable()
export class FoldersRepository {
  list(tx: Tx): Promise<FolderRow[]> {
    return tx.select().from(folders).orderBy(asc(folders.position), asc(folders.createdAt));
  }

  async findById(tx: Tx, id: string): Promise<FolderRow | undefined> {
    const [row] = await tx.select().from(folders).where(eq(folders.id, id));
    return row;
  }

  async create(
    tx: Tx,
    input: { userId: string; name: string; icon: string | null },
  ): Promise<FolderRow> {
    const [row] = await tx.insert(folders).values(input).returning();
    if (!row) throw new Error("No se pudo crear la carpeta");
    return row;
  }

  async rename(
    tx: Tx,
    id: string,
    input: { name: string; icon: string | null },
  ): Promise<FolderRow> {
    const [row] = await tx
      .update(folders)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    if (!row) throw new Error("No se pudo renombrar la carpeta");
    return row;
  }

  async delete(tx: Tx, id: string): Promise<void> {
    await tx.delete(folders).where(eq(folders.id, id));
  }
}
