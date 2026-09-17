import { create } from "zustand";
import { devtools } from "zustand/middleware";

// F6.5 PR6: si la paleta ⌘K está abierta. Existe por la misma razón que
// schedule-drawer-store: el trigger (la píldora del Topbar) y el panel
// (montado en ProtectedLayout, hermano del ScheduleDrawer) están lejos en
// el árbol, y el atajo de teclado puede dispararse desde cualquier lado.

interface CommandPaletteState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()(
  devtools(
    (set) => ({
      open: false,
      openPalette: () => set({ open: true }, false, "command-palette/openPalette"),
      closePalette: () => set({ open: false }, false, "command-palette/closePalette"),
    }),
    { name: "command-palette", enabled: import.meta.env.DEV },
  ),
);
