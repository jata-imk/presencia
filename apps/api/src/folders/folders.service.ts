import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { FolderDto } from "@presencia/shared";
import { DbService, type Tx } from "../db/db.service.js";
import { FoldersRepository, type FolderWithCount } from "./folders.repository.js";

@Injectable()
export class FoldersService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(FoldersRepository) private readonly repo: FoldersRepository,
  ) {}

  listFolders(userId: string): Promise<FolderDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.list(tx);
      return rows.map(toDto);
    });
  }

  createFolder(userId: string, name: string, icon?: string): Promise<FolderDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.repo.create(tx, { userId, name, icon: icon ?? null });
      // Recién creada: 0 por construcción, no hace falta ir a contar.
      return toDto({ ...row, chatCount: 0 });
    });
  }

  renameFolder(userId: string, id: string, name: string, icon?: string): Promise<FolderDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) throw new NotFoundException("Esa carpeta no existe.");
      await this.repo.rename(tx, id, { name, icon: icon ?? existing.icon });
      // Se relee con el conteo en vez de devolver la fila del UPDATE:
      // folders-store.ts reemplaza la fila entera con esta respuesta, así
      // que sin chatCount el badge desaparecería al renombrar.
      const row = await this.repo.findByIdWithCount(tx, id);
      if (!row) throw new NotFoundException("Esa carpeta no existe.");
      return toDto(row);
    });
  }

  deleteFolder(userId: string, id: string): Promise<void> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) throw new NotFoundException("Esa carpeta no existe.");
      // Los chats de la carpeta no se borran — chats.folder_id es
      // onDelete:"set null" (schema.ts), quedan sin carpeta.
      await this.repo.delete(tx, id);
    });
  }

  /**
   * Confirma que `folderId` es una carpeta real del tenant actual — sin
   * esto, ChatService.moveToFolder podría aceptar el id de la carpeta de
   * OTRO usuario: el FK de Postgres valida que la fila exista a nivel
   * físico, no que sea visible bajo RLS para este tenant (ADR-003). Se usa
   * dentro de la MISMA transacción con tenant que hace el UPDATE de chats,
   * así el RLS de esa tx es el filtro real.
   */
  async assertOwnsFolder(tx: Tx, id: string): Promise<void> {
    const row = await this.repo.findById(tx, id);
    if (!row) throw new NotFoundException("Esa carpeta no existe.");
  }
}

function toDto(row: FolderWithCount): FolderDto {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    chatCount: row.chatCount,
    createdAt: row.createdAt.toISOString(),
  };
}
