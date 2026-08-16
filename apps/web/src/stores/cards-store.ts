import { create } from "zustand";
import type { PublicationCardDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// F6 PR4: reemplaza use-chat-cards.ts. El tool part de la card (persistido
// en messages.parts, append-only) solo sabe cómo nació — "Borrador" para
// siempre. Este store trae el estado VIVO desde publication_cards por
// chatId; PublicationCard hace el merge por cardId (contenido del tool
// part, estado de acá). Un store en vez de un hook por-ChatView: cualquier
// componente (incluido un <ScheduleDrawer> montado una sola vez a nivel de
// ChatView, no uno por card) puede leer/refrescar sin pasar por props.

interface CardsState {
  byChatId: Record<string, Map<string, PublicationCardDto>>;
  refresh: (chatId: string) => Promise<void>;
}

const EMPTY_MAP = new Map<string, PublicationCardDto>();

export const useCardsStore = create<CardsState>((set) => ({
  byChatId: {},
  refresh: async (chatId) => {
    try {
      const rows = await apiFetch<PublicationCardDto[]>(`/api/chats/${chatId}/cards`);
      set((state) => ({
        byChatId: { ...state.byChatId, [chatId]: new Map(rows.map((c) => [c.id, c])) },
      }));
    } catch {
      // Silencioso a propósito (mismo criterio que use-quota.ts): sin
      // estado vivo, PublicationCard cae al tool part — el chat sigue
      // usable, solo se pierde el badge/toolbar actualizados.
    }
  },
}));

/** Se suscribe solo al Map de un chat — no a todo el store. */
export function useCardsForChat(chatId: string): Map<string, PublicationCardDto> {
  return useCardsStore((state) => state.byChatId[chatId] ?? EMPTY_MAP);
}
