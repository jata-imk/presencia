import { z } from "zod";

// Contratos de Carpetas (F6 PR8, Chat Part 3.html: ModalNewFolder,
// ModalMoveToFolder, FolderView). La tabla folders existe desde F0/F4
// (folders.brandVoiceId — voz por carpeta, todavía sin UI) pero nunca tuvo
// rutas hasta este PR.

export interface FolderDto {
  id: string;
  name: string;
  icon: string | null;
  createdAt: string;
}

export const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(8).optional(),
});
export type CreateFolderBody = z.infer<typeof createFolderBodySchema>;

export const renameFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(8).optional(),
});
export type RenameFolderBody = z.infer<typeof renameFolderBodySchema>;

export const folderIdParamSchema = z.object({ id: z.uuid() });

export const moveChatBodySchema = z.object({
  // null = sacar el chat de cualquier carpeta ("Sin carpeta").
  folderId: z.uuid().nullable(),
});
export type MoveChatBody = z.infer<typeof moveChatBodySchema>;
