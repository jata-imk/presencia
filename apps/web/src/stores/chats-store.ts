import { create } from "zustand";
import type { ChatSummary } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// F6 PR5: la lista de chats la consumen dos lugares que antes no compartían
// estado — el Sidebar del shell (recientes) y la pantalla de nuevo chat
// (routes/chats.tsx, que ya no es una lista cruda). Mismo patrón chico y
// enfocado que cards-store/schedule-drawer-store/toast-store (F6 PR4): un
// store por responsabilidad, no uno grande.

interface ChatsState {
  chats: ChatSummary[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  create: (title?: string) => Promise<ChatSummary>;
  rename: (id: string, title: string) => Promise<ChatSummary>;
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: null,
  error: null,
  refresh: async () => {
    try {
      const rows = await apiFetch<ChatSummary[]>("/api/chats");
      set({ chats: rows, error: null });
    } catch {
      set({ error: "No se pudieron cargar tus chats." });
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
}));
