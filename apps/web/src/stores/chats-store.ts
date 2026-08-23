import { create } from "zustand";
import type { ChatSummary } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";
import { useFoldersStore } from "./folders-store.js";

// FolderDto.chatCount cuenta los chats NO archivados de cada carpeta
// (ver el invariante en shared/folders.ts). Ese número se calcula en el
// servidor, así que cualquier mutación que cambie la membresía o el
// archivado tiene que pedirlo de nuevo — si no, el badge dice 0 al lado de
// una lista de 1 hasta la próxima recarga completa.
function refreshFolderCounts(): void {
  void useFoldersStore.getState().refresh();
}

// Mismo orden que devuelve GET /chats (chat.repository.ts listChats):
// fijados primero por pinned_at desc, después por actividad. Se replica al
// mutar en local para no dejar la lista en un orden que el servidor nunca
// devolvería hasta el próximo refresh.
function sortLikeServer(rows: ChatSummary[]): ChatSummary[] {
  return [...rows].sort((a, b) => {
    if (a.pinnedAt !== b.pinnedAt) {
      if (a.pinnedAt === null) return 1;
      if (b.pinnedAt === null) return -1;
      return b.pinnedAt.localeCompare(a.pinnedAt);
    }
    return (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
  });
}

// F6 PR5: la lista de chats la consumen dos lugares que antes no compartían
// estado — el Sidebar del shell (recientes) y la pantalla de nuevo chat
// (routes/chats.tsx, que ya no es una lista cruda). Mismo patrón chico y
// enfocado que cards-store/schedule-drawer-store/toast-store (F6 PR4): un
// store por responsabilidad, no uno grande.
//
// F6 PR8: archivar/mover/eliminar. GET /api/chats ya excluye archivados del
// lado del servidor (chat.repository.ts listChats) — archivar/eliminar acá
// solo tienen que sacar la fila de `chats`, no volver a pedir la lista
// completa. Archivados viven en su propio array (`archivedChats`), cargado
// aparte por ArchivedView — nunca se mezclan (mismo criterio que el mockup:
// ArchivedView es una pantalla distinta, no un filtro de Recientes).

interface ChatsState {
  chats: ChatSummary[] | null;
  archivedChats: ChatSummary[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  refreshArchived: () => Promise<void>;
  create: (title?: string) => Promise<ChatSummary>;
  rename: (id: string, title: string) => Promise<ChatSummary>;
  moveToFolder: (id: string, folderId: string | null) => Promise<ChatSummary>;
  setPinned: (id: string, pinned: boolean) => Promise<ChatSummary>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: null,
  archivedChats: null,
  error: null,
  refresh: async () => {
    try {
      const rows = await apiFetch<ChatSummary[]>("/api/chats");
      set({ chats: rows, error: null });
    } catch {
      set({ error: "No se pudieron cargar tus chats." });
    }
  },
  refreshArchived: async () => {
    try {
      const rows = await apiFetch<ChatSummary[]>("/api/chats/archived");
      set({ archivedChats: rows, error: null });
    } catch {
      set({ error: "No se pudieron cargar tus chats archivados." });
    }
  },
  create: async (title) => {
    const chat = await apiFetch<ChatSummary>("/api/chats", { method: "POST", body: { title } });
    set({ chats: [chat, ...(get().chats ?? [])] });
    return chat;
  },
  rename: async (id, title) => {
    const updated = await apiFetch<ChatSummary>(`/api/chats/${id}`, {
      method: "PATCH",
      body: { title },
    });
    set((state) => ({
      chats: state.chats?.map((c) => (c.id === id ? updated : c)) ?? null,
    }));
    return updated;
  },
  moveToFolder: async (id, folderId) => {
    const updated = await apiFetch<ChatSummary>(`/api/chats/${id}/folder`, {
      method: "PATCH",
      body: { folderId },
    });
    set((state) => ({
      chats: state.chats?.map((c) => (c.id === id ? updated : c)) ?? null,
    }));
    refreshFolderCounts();
    return updated;
  },
  setPinned: async (id, pinned) => {
    const updated = await apiFetch<ChatSummary>(`/api/chats/${id}/${pinned ? "pin" : "unpin"}`, {
      method: "POST",
    });
    set((state) => ({
      chats: state.chats
        ? sortLikeServer(state.chats.map((c) => (c.id === id ? updated : c)))
        : null,
    }));
    return updated;
  },
  archive: async (id) => {
    await apiFetch<ChatSummary>(`/api/chats/${id}/archive`, { method: "POST" });
    set((state) => ({ chats: state.chats?.filter((c) => c.id !== id) ?? null }));
    refreshFolderCounts();
  },
  unarchive: async (id) => {
    // El mirror de archive() no basta: archive() solo saca de `chats`
    // porque archivedChats se carga aparte, pero unarchive() necesita
    // meterlo de vuelta en `chats` (code review 2026-08-20) — sin esto, un
    // chat recién desarchivado desaparecía de Recientes hasta un refresh
    // que nada dispara (Sidebar solo llama refresh() una vez, al montar).
    const updated = await apiFetch<ChatSummary>(`/api/chats/${id}/unarchive`, { method: "POST" });
    set((state) => ({
      archivedChats: state.archivedChats?.filter((c) => c.id !== id) ?? null,
      chats: sortLikeServer([updated, ...(state.chats ?? [])]),
    }));
    refreshFolderCounts();
  },
  remove: async (id) => {
    await apiFetch<undefined>(`/api/chats/${id}`, { method: "DELETE" });
    set((state) => ({
      chats: state.chats?.filter((c) => c.id !== id) ?? null,
      archivedChats: state.archivedChats?.filter((c) => c.id !== id) ?? null,
    }));
    refreshFolderCounts();
  },
}));
