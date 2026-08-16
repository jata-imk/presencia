import { create } from "zustand";
import type { PublicationCardDto } from "@presencia/shared";

// F6 PR4: qué cards se están programando ahora mismo. Antes (PR3) cada
// PublicationCard montaba su PROPIO <ScheduleDrawer> condicional en
// useState local; con este store se monta un solo <ScheduleDrawer/> a
// nivel de ChatView, que simplemente refleja este estado — cualquier card
// (o el toolbar de cualquier card del grupo) puede abrirlo sin que el
// drawer "pertenezca" a una instancia específica.

interface ScheduleDrawerState {
  cards: PublicationCardDto[] | null;
  open: (cards: PublicationCardDto[]) => void;
  close: () => void;
}

export const useScheduleDrawerStore = create<ScheduleDrawerState>((set) => ({
  cards: null,
  open: (cards) => set({ cards }),
  close: () => set({ cards: null }),
}));
