import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { PublicationCardDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";
import { type CalendarFilters, fetchCardsInRange, fetchDraftCards } from "../lib/cards-api.js";
import {
  belongsToDrafts,
  belongsToRange,
  isNotOlder,
  sortByScheduledAt,
} from "../lib/cards/membership.js";
import { useChatsStore } from "./chats-store.js";

// Store normalizado de cards (F8.6, addendum de ADR-018). Una sola copia de
// cada card —`byId`— y las vistas guardan ids: las cards de cada chat, el
// rango del Calendario y la bandeja de borradores. Cambiar una card en
// `byId` la cambia en todas las pantallas a la vez, venga de donde venga el
// cambio: la respuesta de una mutación, una recarga o un evento SSE.
//
// Antes eran tres copias: `cards-store` (por chat), `calendar-store` (rango y
// borradores) y el snapshot de `schedule-drawer-store`. Se separaron a
// propósito en F7 porque cada vista hace otra pregunta; esa diferencia sigue
// existiendo, pero ahora vive en las listas de ids y en las reglas de
// pertenencia (lib/cards/membership.ts), no en copias que había que
// sincronizar a mano con un `refresh` después de cada acción.
//
// El tool part del chat (messages.parts, append-only) sigue siendo la fuente
// del CONTENIDO con que nació la card; de acá sale el estado vivo.

interface RangeView {
  from: Date;
  to: Date;
  filters: CalendarFilters;
  ids: string[];
}

interface CardsState {
  byId: Record<string, PublicationCardDto>;
  /** Ids por chat, en el orden del servidor (`createdAt`). Solo chats ya cargados. */
  chatIds: Record<string, string[]>;
  /** La última consulta del Calendario. Sobrevive a salir del módulo: volver no parpadea. */
  range: RangeView | null;
  rangeLoading: boolean;
  /** Mensaje listo para mostrar, o null. Solo se llena si la carga falló de verdad. */
  rangeError: string | null;
  /** Borradores sin fecha, más nuevos primero. null = nunca se pidieron. */
  draftIds: string[] | null;
  /** El chat en pantalla (lo fija chat.tsx). Es lo único de chats que `revalidate` recarga. */
  openChatId: string | null;
  /** Si el Calendario está montado (lo fija calendario.tsx). */
  calendarOpen: boolean;

  setOpenChat: (chatId: string | null) => void;
  setCalendarOpen: (open: boolean) => void;
  loadChat: (chatId: string) => Promise<void>;
  /** `silent`: sin indicador de carga — para revalidar sin que la grilla diga "Cargando…". */
  loadRange: (
    from: Date,
    to: Date,
    filters?: CalendarFilters,
    options?: { silent?: boolean },
  ) => Promise<void>;
  loadDrafts: () => Promise<void>;
  /** Aplica una o varias versiones de cards: entidad + pertenencia a cada vista. */
  apply: (cards: PublicationCardDto | PublicationCardDto[]) => void;
  remove: (cardId: string) => void;
  /** Vuelve a pedir lo que está en pantalla: el chat abierto, el rango y la bandeja. */
  revalidate: () => Promise<void>;
}

// Guardas de carrera (venían de calendar-store): navegar rápido entre meses
// dispara varias cargas y la primera puede contestar última. `rangeToken`
// descarta las respuestas viejas; el AbortController corta la que ya no
// interesa. La bandeja no tenía guarda porque solo se pedía al montar; con
// `revalidate` se puede pedir dos veces seguidas y necesita la suya.
let rangeToken = 0;
let rangeInFlight: AbortController | null = null;
let draftsToken = 0;
// La consulta PEDIDA más reciente, no la última que respondió (`range`).
// Revalidar tiene que repetir esta: si el usuario acaba de pasar a octubre y
// la carga sigue en vuelo, repetir `range` (septiembre) cancelaría la de
// octubre y dejaría la grilla con el mes equivocado.
let lastRangeQuery: { from: Date; to: Date; filters: CalendarFilters } | null = null;

function folderOfChat(chatId: string): string | null | undefined {
  return useChatsStore.getState().chats?.find((chat) => chat.id === chatId)?.folderId;
}

/**
 * Mezcla versiones nuevas en `byId` respetando la guardia de orden. Devuelve
 * el mapa nuevo (o el mismo si nada cambió) y las cards que sí entraron.
 */
function mergeEntities(
  byId: Record<string, PublicationCardDto>,
  cards: PublicationCardDto[],
): { byId: Record<string, PublicationCardDto>; accepted: PublicationCardDto[] } {
  let next = byId;
  const accepted: PublicationCardDto[] = [];
  for (const card of cards) {
    const current = next[card.id];
    if (current === card) continue;
    if (current && !isNotOlder(card, current)) continue;
    if (next === byId) next = { ...byId };
    next[card.id] = card;
    accepted.push(card);
  }
  return { byId: next, accepted };
}

export const useCardsStore = create<CardsState>()(
  devtools(
    (set, get) => ({
      byId: {},
      chatIds: {},
      range: null,
      rangeLoading: false,
      rangeError: null,
      draftIds: null,
      openChatId: null,
      calendarOpen: false,

      setOpenChat: (openChatId) => set({ openChatId }, false, "cards/setOpenChat"),
      setCalendarOpen: (calendarOpen) => set({ calendarOpen }, false, "cards/setCalendarOpen"),

      loadChat: async (chatId) => {
        try {
          const rows = await apiFetch<PublicationCardDto[]>(`/api/chats/${chatId}/cards`);
          set(
            (state) => ({
              byId: mergeEntities(state.byId, rows).byId,
              chatIds: { ...state.chatIds, [chatId]: rows.map((card) => card.id) },
            }),
            false,
            "cards/loadChat",
          );
        } catch {
          // Silencioso a propósito (mismo criterio que use-quota.ts): sin
          // estado vivo, PublicationCard cae al tool part — el chat sigue
          // usable, solo se pierde el badge/toolbar actualizados.
        }
      },

      loadRange: async (from, to, filters = {}, options = {}) => {
        rangeInFlight?.abort();
        const controller = new AbortController();
        rangeInFlight = controller;
        const token = (rangeToken += 1);
        lastRangeQuery = { from, to, filters };

        // Las cards anteriores NO se limpian: cambiar de mes deja la grilla
        // poblada hasta que llega la nueva respuesta, en vez de parpadear a
        // vacío y volver. El indicador de carga es `rangeLoading`, no un hueco.
        if (!options.silent)
          set({ rangeLoading: true, rangeError: null }, false, "cards/loadRange");
        try {
          const rows = await fetchCardsInRange(from, to, filters, controller.signal);
          if (token !== rangeToken) return;
          set(
            (state) => {
              const { byId } = mergeEntities(state.byId, rows);
              // Si la guardia de orden conservó una versión más nueva que la
              // de la respuesta, esa versión decide si pertenece.
              const query = { from, to, filters };
              const ids = rows
                .map((row) => row.id)
                .filter((id) => belongsToRange(byId[id]!, query, folderOfChat) !== false);
              return {
                byId,
                range: { ...query, ids },
                rangeLoading: false,
                rangeError: null,
              };
            },
            false,
            "cards/loadRange/done",
          );
        } catch (error) {
          if (controller.signal.aborted || token !== rangeToken) return;
          set(
            {
              rangeLoading: false,
              // Una revalidación silenciosa que falla no pone el banner: lo
              // que está en pantalla sigue siendo lo último que se supo.
              ...(options.silent
                ? {}
                : {
                    rangeError:
                      error instanceof Error ? error.message : "No se pudo cargar el calendario.",
                  }),
            },
            false,
            "cards/loadRange/error",
          );
        } finally {
          if (rangeInFlight === controller) rangeInFlight = null;
        }
      },

      loadDrafts: async () => {
        const token = (draftsToken += 1);
        try {
          const rows = await fetchDraftCards();
          if (token !== draftsToken) return;
          set(
            (state) => {
              const { byId } = mergeEntities(state.byId, rows);
              return {
                byId,
                draftIds: rows.map((row) => row.id).filter((id) => belongsToDrafts(byId[id]!)),
              };
            },
            false,
            "cards/loadDrafts",
          );
        } catch {
          // En silencio: que la bandeja de borradores no cargue no debe tumbar
          // la grilla, que es lo que el usuario vino a ver.
        }
      },

      apply: (input) => {
        const cards = Array.isArray(input) ? input : [input];
        let rangeUnknown = false;
        set(
          (state) => {
            const { byId, accepted } = mergeEntities(state.byId, cards);
            if (accepted.length === 0) return {};

            let { chatIds, draftIds, range } = state;
            for (const card of accepted) {
              // Chat: `chatId` no cambia nunca, así que solo puede entrar (una
              // card recién creada) y solo si ese chat ya está cargado.
              const inChat = card.chatId ? chatIds[card.chatId] : undefined;
              if (card.chatId && inChat && !inChat.includes(card.id)) {
                chatIds = { ...chatIds, [card.chatId]: [...inChat, card.id] };
              }

              if (draftIds) {
                const has = draftIds.includes(card.id);
                const belongs = belongsToDrafts(card);
                if (belongs && !has) draftIds = [card.id, ...draftIds];
                if (!belongs && has) draftIds = draftIds.filter((id) => id !== card.id);
              }

              if (range) {
                const has = range.ids.includes(card.id);
                const belongs = belongsToRange(card, range, folderOfChat);
                if (belongs === "unknown") rangeUnknown = true;
                else if (belongs) {
                  range = {
                    ...range,
                    ids: sortByScheduledAt(has ? range.ids : [...range.ids, card.id], byId),
                  };
                } else if (has) {
                  range = { ...range, ids: range.ids.filter((id) => id !== card.id) };
                }
              }
            }
            return { byId, chatIds, draftIds, range };
          },
          false,
          "cards/apply",
        );
        // El cliente no conoce la carpeta de ese chat: en vez de adivinar, se
        // vuelve a preguntar al servidor con la misma consulta.
        if (rangeUnknown && lastRangeQuery) {
          const { from, to, filters } = lastRangeQuery;
          void get().loadRange(from, to, filters, { silent: true });
        }
      },

      remove: (cardId) =>
        set(
          (state) => {
            if (!state.byId[cardId]) return {};
            const byId = { ...state.byId };
            delete byId[cardId];
            const without = (ids: string[]) => ids.filter((id) => id !== cardId);
            return {
              byId,
              chatIds: Object.fromEntries(
                Object.entries(state.chatIds).map(([chatId, ids]) => [chatId, without(ids)]),
              ),
              draftIds: state.draftIds && without(state.draftIds),
              range: state.range && { ...state.range, ids: without(state.range.ids) },
            };
          },
          false,
          "cards/remove",
        ),

      revalidate: async () => {
        const { openChatId, calendarOpen, loadChat, loadRange, loadDrafts } = get();
        const query = lastRangeQuery;
        await Promise.all([
          openChatId ? loadChat(openChatId) : undefined,
          calendarOpen && query
            ? loadRange(query.from, query.to, query.filters, { silent: true })
            : undefined,
          calendarOpen ? loadDrafts() : undefined,
        ]);
      },
    }),
    { name: "cards", enabled: import.meta.env.DEV },
  ),
);

const NO_CARDS: PublicationCardDto[] = [];

function pick(byId: Record<string, PublicationCardDto>, ids: string[] | null | undefined) {
  if (!ids || ids.length === 0) return NO_CARDS;
  return ids.map((id) => byId[id]).filter((card): card is PublicationCardDto => card !== undefined);
}

// Selectores. Los que devuelven listas van con `useShallow`: `pick` arma un
// arreglo nuevo en cada llamada, y zustand v5 compara por referencia — sin
// esto el componente se re-renderiza en bucle. Con `useShallow` la referencia
// solo cambia si cambió alguna card, que es lo que esperan los `useMemo` de
// calendario.tsx (`entriesByDay`, `conflictDays`, …).

export function useCard(cardId: string | undefined): PublicationCardDto | undefined {
  return useCardsStore((state) => (cardId ? state.byId[cardId] : undefined));
}

export function useCardsByIds(ids: string[] | null | undefined): PublicationCardDto[] {
  return useCardsStore(useShallow((state) => pick(state.byId, ids)));
}

export function useChatCards(chatId: string): PublicationCardDto[] {
  return useCardsStore(useShallow((state) => pick(state.byId, state.chatIds[chatId])));
}

export function useRangeCards(): PublicationCardDto[] {
  return useCardsStore(useShallow((state) => pick(state.byId, state.range?.ids)));
}

export function useDraftCards(): PublicationCardDto[] {
  return useCardsStore(useShallow((state) => pick(state.byId, state.draftIds)));
}
