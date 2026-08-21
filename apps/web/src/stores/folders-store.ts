import { create } from "zustand";
import type { FolderDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// F6 PR8 — Sidebar (sección "Carpetas") y ModalMoveToFolder comparten esto.
// Mismo patrón chico que chats-store/cards-store.

interface FoldersState {
  folders: FolderDto[] | null;
  refresh: () => Promise<void>;
  create: (name: string, icon?: string) => Promise<FolderDto>;
  rename: (id: string, name: string, icon?: string) => Promise<FolderDto>;
  remove: (id: string) => Promise<void>;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: null,
  refresh: async () => {
    try {
      const rows = await apiFetch<FolderDto[]>("/api/folders");
      set({ folders: rows });
    } catch {
      // Las carpetas del sidebar son un extra, no bloquean el chat si esto falla.
    }
  },
  create: async (name, icon) => {
    const folder = await apiFetch<FolderDto>("/api/folders", {
      method: "POST",
      body: { name, icon },
    });
    set({ folders: [...(get().folders ?? []), folder] });
    return folder;
  },
  rename: async (id, name, icon) => {
    const updated = await apiFetch<FolderDto>(`/api/folders/${id}`, {
      method: "PATCH",
      body: { name, icon },
    });
    set((state) => ({
      folders: state.folders?.map((f) => (f.id === id ? updated : f)) ?? null,
    }));
    return updated;
  },
  remove: async (id) => {
    await apiFetch<undefined>(`/api/folders/${id}`, { method: "DELETE" });
    set((state) => ({ folders: state.folders?.filter((f) => f.id !== id) ?? null }));
  },
}));
