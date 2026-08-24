import { create } from "zustand";
import type { PublicationCardDto } from "@presencia/shared";
import { type CalendarFilters, fetchCardsInRange, fetchDraftCards } from "../lib/cards-api.js";

// Store del Calendario (F7). Deliberadamente separado de cards-store.ts:
// aquel indexa por chatId (`byChatId`), que es la pregunta del Chat. Acá la
// pregunta es "¿qué hay entre estas dos fechas?" y la respuesta cruza chats,
// incluye cards huérfanas y cambia con los filtros. Meter las dos en el
// mismo store obligaría a inventar una clave que sirva para ambas.

interface CalendarState {
  cards: PublicationCardDto[];
  /**
   * Borradores sin fecha (F7 PR3). Van aparte de `cards` y no mezclados: no
   * pertenecen a ningún día, no entran en ningún rango y su ciclo de recarga
   * es otro — un borrador se vuelve programado y cruza de una lista a la
   * otra, así que tenerlas separadas hace ese cruce explícito.
   */
  drafts: PublicationCardDto[];
  loading: boolean;
  /** Mensaje listo para mostrar, o null. Solo se llena si la carga falló de verdad. */
  error: string | null;
  load: (from: Date, to: Date, filters?: CalendarFilters) => Promise<void>;
  loadDrafts: () => Promise<void>;
  /** Reemplaza (o agrega) una card tras una mutación — base del optimismo. */
  upsert: (card: PublicationCardDto) => void;
  reset: () => void;
}

// Guardas de carrera: navegar rápido entre meses dispara varias cargas y la
// primera puede contestar última. `requestToken` descarta las respuestas
// viejas; el AbortController además corta la petición que ya no interesa.
let requestToken = 0;
let inFlight: AbortController | null = null;

export const useCalendarStore = create<CalendarState>((set) => ({
  cards: [],
  drafts: [],
  loading: false,
  error: null,

  load: async (from, to, filters = {}) => {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    const token = (requestToken += 1);

    // Las cards anteriores NO se limpian: cambiar de mes deja la grilla
    // poblada hasta que llega la nueva respuesta, en vez de parpadear a
    // vacío y volver. El indicador de carga es `loading`, no un hueco.
    set({ loading: true, error: null });
    try {
      const cards = await fetchCardsInRange(from, to, filters, controller.signal);
      if (token !== requestToken) return;
      set({ cards, loading: false, error: null });
    } catch (error) {
      if (controller.signal.aborted || token !== requestToken) return;
      set({
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo cargar el calendario.",
      });
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  },

  loadDrafts: async () => {
    try {
      set({ drafts: await fetchDraftCards() });
    } catch {
      // En silencio: que la bandeja de borradores no cargue no debe tumbar
      // la grilla, que es lo que el usuario vino a ver. Mismo criterio que
      // cards-store.refresh.
    }
  },

  upsert: (card) =>
    set((state) => {
      const index = state.cards.findIndex((existing) => existing.id === card.id);
      if (index === -1) return { cards: [...state.cards, card] };
      const cards = state.cards.slice();
      cards[index] = card;
      return { cards };
    }),

  reset: () => {
    inFlight?.abort();
    inFlight = null;
    requestToken += 1;
    set({ cards: [], drafts: [], loading: false, error: null });
  },
}));
