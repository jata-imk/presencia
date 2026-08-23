import { create } from "zustand";

// F6.5 PR6: si la paleta ⌘K está abierta. Existe por la misma razón que
// schedule-drawer-store: el trigger (la píldora del Topbar) y el panel
// (montado en ProtectedLayout, hermano del ScheduleDrawer) están lejos en
// el árbol, y el atajo de teclado puede dispararse desde cualquier lado.

interface CommandPaletteState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
}));
