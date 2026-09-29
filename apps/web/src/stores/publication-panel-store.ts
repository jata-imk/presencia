import { create } from "zustand";
import { devtools } from "zustand/middleware";

// F10.5: el panel de publicación del chat (Chat Rediseño.html → Panel), tipo
// artifact. Guarda qué cards están abiertas como pestañas, cuál se ve y en qué
// modo. Ids, no copias: el panel lee las cards vivas de cards-store, igual que
// el drawer de programar.
//
// Qué se persiste y qué no:
// - El ANCHO sí (localStorage): es una preferencia de lectura del usuario.
// - "Cerré el panel en este chat" también, por chat: si lo cerró, ese chat
//   no se lo vuelve a abrir solo. Es conveniencia de este navegador — si se
//   pierde, lo peor que pasa es que el panel se abra solo otra vez.
// - Lo demás (pestañas, modo) no: al volver a un chat empieza cerrado.

const WIDTH_KEY = "presencia.panel.width";
const DISMISSED_KEY = "presencia.panel.dismissed";

/** Fracción del área de contenido; el diseño usa ~45%. */
export const PANEL_WIDTH_DEFAULT = 0.45;
export const PANEL_WIDTH_MIN_PX = 360;
export const PANEL_WIDTH_MAX = 0.6;

export type PanelMode = "preview" | "edit";

function readWidth(): number {
  try {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 && raw <= PANEL_WIDTH_MAX ? raw : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

function readDismissed(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    // Solo los últimos 200: una lista que crece para siempre en localStorage
    // no le sirve a nadie, y un chat viejo que se reabra solo no es grave.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Sin persistencia el panel igual funciona; solo olvida la decisión.
  }
}

interface PanelState {
  /** El chat al que pertenecen las pestañas. El panel no sobrevive a cambiar de chat. */
  chatId: string | null;
  cardIds: string[];
  activeId: string | null;
  mode: PanelMode;
  /** Fracción del área del chat. */
  width: number;
  dismissedChats: Set<string>;

  open: (chatId: string, cardIds: string[], activeId?: string) => void;
  /**
   * Suma pestañas sin cambiar la activa. La autoapertura la usa mientras los
   * borradores de un turno siguen naciendo.
   */
  addCards: (chatId: string, cardIds: string[]) => void;
  setActive: (cardId: string) => void;
  setMode: (mode: PanelMode) => void;
  /** Cierre del usuario: además recuerda no volver a abrirse solo en ese chat. */
  close: () => void;
  /** Cierre sin recordar nada (cambiar de chat, desmontar la vista). */
  reset: () => void;
  setWidth: (fraction: number) => void;
}

const closed = { chatId: null, cardIds: [], activeId: null, mode: "preview" as const };

export const usePublicationPanelStore = create<PanelState>()(
  devtools(
    (set, get) => ({
      ...closed,
      width: readWidth(),
      dismissedChats: readDismissed(),

      open: (chatId, cardIds, activeId) => {
        if (cardIds.length === 0) return;
        const active = activeId && cardIds.includes(activeId) ? activeId : cardIds[0]!;
        // Mismo chat y mismas pestañas: solo cambia la activa, y el modo se
        // conserva (volver a una card que estabas editando no te saca).
        const { chatId: current, cardIds: currentIds, mode } = get();
        const same =
          current === chatId &&
          currentIds.length === cardIds.length &&
          currentIds.every((id, i) => id === cardIds[i]);
        set(
          { chatId, cardIds, activeId: active, mode: same ? mode : "preview" },
          false,
          "panel/open",
        );
      },

      addCards: (chatId, cardIds) => {
        const state = get();
        if (state.chatId !== chatId) return;
        const missing = cardIds.filter((id) => !state.cardIds.includes(id));
        if (missing.length === 0) return;
        set({ cardIds: [...state.cardIds, ...missing] }, false, "panel/addCards");
      },

      setActive: (activeId) => {
        if (!get().cardIds.includes(activeId)) return;
        set({ activeId }, false, "panel/setActive");
      },

      setMode: (mode) => set({ mode }, false, "panel/setMode"),

      close: () => {
        const { chatId, dismissedChats } = get();
        if (chatId) {
          const next = new Set(dismissedChats);
          next.add(chatId);
          writeDismissed(next);
          set({ ...closed, dismissedChats: next }, false, "panel/close");
          return;
        }
        set(closed, false, "panel/close");
      },

      reset: () => set(closed, false, "panel/reset"),

      setWidth: (fraction) => {
        const width = Math.min(Math.max(fraction, 0.2), PANEL_WIDTH_MAX);
        set({ width }, false, "panel/setWidth");
        try {
          localStorage.setItem(WIDTH_KEY, String(width));
        } catch {
          // Igual se aplica en esta sesión.
        }
      },
    }),
    { name: "publication-panel", enabled: import.meta.env.DEV },
  ),
);

/** El panel está abierto (con al menos una pestaña). */
export function usePanelOpen(): boolean {
  return usePublicationPanelStore((s) => s.activeId !== null);
}
