import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { chats, folders } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a folders vive aquí (patrón de ChatRepository/CardsRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro
// (tenant_isolation, migración 0001).

export type FolderRow = typeof folders.$inferSelect;
export type FolderWithCount = FolderRow & { chatCount: number };

// INVARIANTE: chatCount cuenta exactamente lo mismo que devuelve
// GET /chats — no archivados. Si esa lista cambia de criterio (o se
// pagina), este conteo tiene que seguirla, o el badge de la carpeta va a
// decir 7 al lado de una lista de 3, que es un reporte de bug garantizado.
const chatCount = sql<number>`count(${chats.id})::int`;

// El filtro de archivados va en el ON del LEFT JOIN y NO en un WHERE: un
// WHERE degradaría el LEFT JOIN a INNER y las carpetas vacías
// desaparecerían de la lista.
const joinActiveChats = and(eq(chats.folderId, folders.id), isNull(chats.archivedAt));

@Injectable()
export class FoldersRepository {
  // Una sola query, sin N+1. Tres detalles que parecen cosméticos y no lo
  // son: count(chats.id) y no count(*) —con count(*) una carpeta vacía
  // devuelve 1, por la fila null-extended del LEFT JOIN—; ::int porque
  // count() es bigint y node-postgres lo entrega como *string*, o sea que
  // sql<number> mentiría y `chatCount > 0` sería true para "0"; y el
  // groupBy por PK, que Postgres acepta con las demás columnas por
  // dependencia funcional.
  list(tx: Tx): Promise<FolderWithCount[]> {
    return tx
      .select({
        id: folders.id,
        userId: folders.userId,
        name: folders.name,
        icon: folders.icon,
        brandVoiceId: folders.brandVoiceId,
        position: folders.position,
        createdAt: folders.createdAt,
        updatedAt: folders.updatedAt,
        chatCount,
      })
      .from(folders)
      .leftJoin(chats, joinActiveChats)
      .groupBy(folders.id)
      .orderBy(asc(folders.position), asc(folders.createdAt));
  }

  async findById(tx: Tx, id: string): Promise<FolderRow | undefined> {
    const [row] = await tx.select().from(folders).where(eq(folders.id, id));
    return row;
  }

  // Necesario porque folders-store.ts reemplaza la fila entera con la
  // respuesta del PATCH: sin el conteo acá, el badge desaparecía de la UI
  // al renombrar una carpeta.
  async findByIdWithCount(tx: Tx, id: string): Promise<FolderWithCount | undefined> {
    const [row] = await tx
      .select({
        id: folders.id,
        userId: folders.userId,
        name: folders.name,
        icon: folders.icon,
        brandVoiceId: folders.brandVoiceId,
        position: folders.position,
        createdAt: folders.createdAt,
        updatedAt: folders.updatedAt,
        chatCount,
      })
      .from(folders)
      .leftJoin(chats, joinActiveChats)
      .where(eq(folders.id, id))
      .groupBy(folders.id);
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
