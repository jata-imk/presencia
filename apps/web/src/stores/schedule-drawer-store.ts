import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { PublicationCardDto } from "@presencia/shared";
import { useCardsStore } from "./cards-store.js";

// F6 PR4: qué cards se están programando ahora mismo. Antes (PR3) cada
// PublicationCard montaba su PROPIO <ScheduleDrawer> condicional en
// useState local; con este store se monta un solo <ScheduleDrawer/> a
// nivel de ChatView, que simplemente refleja este estado — cualquier card
// (o el toolbar de cualquier card del grupo) puede abrirlo sin que el
// drawer "pertenezca" a una instancia específica.
//
// F8.6: guarda ids, no una foto de las cards. El drawer las lee vivas de
// cards-store, así que si una cambia mientras está abierto (el worker la
// publica, otra pestaña la cancela) el encabezado lo refleja. Lo que el
// usuario ya llenó (horario, cuenta) vive en el estado local del drawer y no
// se toca.

interface ScheduleDrawerState {
  cardIds: string[] | null;
  /**
   * Fecha y hora con la que abre el formulario (F7). Sin esto el drawer
   * siempre arranca en "mañana 10:00", que para REPROGRAMAR es un default
   * activamente malo: borra el horario que la card ya tiene y obliga a
   * reescribirlo. El Calendario pasa el `scheduledAt` real al reprogramar y,
   * en el drag de un borrador, el día donde se soltó.
   */
  presetDate: Date | null;
  open: (cards: PublicationCardDto[], options?: { presetDate?: Date | null }) => void;
  close: () => void;
}

export const useScheduleDrawerStore = create<ScheduleDrawerState>()(
  devtools(
    (set) => ({
      cardIds: null,
      presetDate: null,
      open: (cards, options) => {
        // Quien abre ya tiene las cards, casi siempre sacadas del mismo store
        // (la guardia de orden las ignora). Aplicarlas cubre el caso en que no.
        useCardsStore.getState().apply(cards);
        set(
          { cardIds: cards.map((card) => card.id), presetDate: options?.presetDate ?? null },
          false,
          "drawer/open",
        );
      },
      close: () => set({ cardIds: null, presetDate: null }, false, "drawer/close"),
    }),
    { name: "schedule-drawer", enabled: import.meta.env.DEV },
  ),
);
