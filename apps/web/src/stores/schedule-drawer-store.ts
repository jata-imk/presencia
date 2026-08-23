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
  /**
   * Fecha y hora con la que abre el formulario (F7). Sin esto el drawer
   * siempre arranca en "mañana 10:00", que para REPROGRAMAR es un default
   * activamente malo: borra el horario que la card ya tiene y obliga a
   * reescribirlo. El Calendario pasa el `scheduledAt` real al reprogramar y,
   * en el drag de un borrador, el día donde se soltó.
   */
  presetDate: Date | null;
  /**
   * Se llama después de un submit exitoso (F7). El drawer refresca
   * `cards-store` por chatId, que es lo que necesita el Chat; el Calendario
   * lee de `calendar-store` por rango y de una card huérfana (chatId null)
   * ni siquiera hay chat que refrescar — sin este callback, reprogramar
   * desde el Calendario cerraba el drawer y dejaba la grilla con el horario
   * viejo hasta cambiar de mes o recargar.
   */
  onDone: (() => void) | null;
  open: (
    cards: PublicationCardDto[],
    options?: { presetDate?: Date | null; onDone?: () => void },
  ) => void;
  close: () => void;
}

export const useScheduleDrawerStore = create<ScheduleDrawerState>((set) => ({
  cards: null,
  presetDate: null,
  onDone: null,
  open: (cards, options) =>
    set({ cards, presetDate: options?.presetDate ?? null, onDone: options?.onDone ?? null }),
  close: () => set({ cards: null, presetDate: null, onDone: null }),
}));
