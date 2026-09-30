import { create } from "zustand";
import { devtools } from "zustand/middleware";

// F10.5 PR5: la selección multired del chat (Chat Rediseño.html → 7.1). El
// usuario marca cards de mensajes distintos —un post de Facebook del lunes y
// el carrusel de hoy— para verlas juntas en el panel o programarlas a la vez.
// Efímera: es del chat que está en pantalla y no sobrevive a salir de él.

interface SelectionState {
  chatId: string | null;
  ids: string[];
  toggle: (chatId: string, cardId: string) => void;
  /** Marca varias de un jalón (el "Seleccionar" de un grupo). */
  selectMany: (chatId: string, cardIds: string[]) => void;
  clear: () => void;
  /** Deja solo estas (las que siguen siendo seleccionables). */
  retain: (chatId: string, cardIds: string[]) => void;
}

export const useCardSelectionStore = create<SelectionState>()(
  devtools(
    (set, get) => ({
      chatId: null,
      ids: [],
      toggle: (chatId, cardId) => {
        const current = get();
        const ids = current.chatId === chatId ? current.ids : [];
        set(
          {
            chatId,
            ids: ids.includes(cardId) ? ids.filter((id) => id !== cardId) : [...ids, cardId],
          },
          false,
          "selection/toggle",
        );
      },
      selectMany: (chatId, cardIds) => {
        const current = get();
        const ids = current.chatId === chatId ? current.ids : [];
        set(
          { chatId, ids: [...ids, ...cardIds.filter((id) => !ids.includes(id))] },
          false,
          "selection/selectMany",
        );
      },
      clear: () => set({ chatId: null, ids: [] }, false, "selection/clear"),
      retain: (chatId, cardIds) => {
        const current = get();
        if (current.chatId !== chatId) return;
        set({ ids: current.ids.filter((id) => cardIds.includes(id)) }, false, "selection/retain");
      },
    }),
    { name: "card-selection", enabled: import.meta.env.DEV },
  ),
);

/** Las cards seleccionadas en este chat (vacío si la selección es de otro). */
export function useSelectedIds(chatId: string): string[] {
  return useCardSelectionStore((s) => (s.chatId === chatId ? s.ids : NONE));
}

const NONE: string[] = [];
