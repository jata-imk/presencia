import { create } from "zustand";

// F6.5 PR1: estado del App Shell. Tres cosas distintas viven acá y solo
// dos se persisten.
//
// Lo que se persiste es LA DECISIÓN DEL USUARIO, nunca el estado efectivo.
// `userCollapsed: null` significa "todavía no elegí" → manda el viewport
// (colapsado abajo de 1024). En cuanto el usuario toca el botón se guarda
// true/false y esa decisión sobrevive rotaciones, resizes y recargas. El
// estado efectivo se recalcula siempre en el componente:
//
//   const collapsed = userCollapsed ?? !isDesktop;
//
// Es exactamente el mismo patrón que theme-store.ts, donde "system" hace
// de null y la preferencia explícita gana sobre prefers-color-scheme.
//
// Persistencia a mano en vez del middleware `persist` de zustand:
// mobileOpen/expandedFolderId NO deben persistir (haría falta partialize)
// y el tema necesita persistencia manual de todos modos por el script
// anti-FOUC de index.html. Una sola forma de hacerlo en el repo, no dos.

const STORAGE_KEY = "presencia.sidebar";

export const SIDEBAR_WIDTH_DEFAULT = 220;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 320;

export function clampSidebarWidth(px: number): number {
  return Math.min(Math.max(Math.round(px), SIDEBAR_WIDTH_MIN), SIDEBAR_WIDTH_MAX);
}

interface Persisted {
  userCollapsed: boolean | null;
  width: number;
}

function readPersisted(): Persisted {
  const fallback: Persisted = { userCollapsed: null, width: SIDEBAR_WIDTH_DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { userCollapsed, width } = parsed as Partial<Persisted>;
    return {
      userCollapsed: typeof userCollapsed === "boolean" ? userCollapsed : null,
      width:
        typeof width === "number" && Number.isFinite(width)
          ? clampSidebarWidth(width)
          : SIDEBAR_WIDTH_DEFAULT,
    };
  } catch {
    // localStorage puede tirar (Safari en privado, storage deshabilitado)
    // y el JSON puede estar corrupto a mano. Nada de esto justifica que
    // no cargue el sidebar.
    return fallback;
  }
}

function persist(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sin persistencia el sidebar sigue funcionando, solo se olvida.
  }
}

interface SidebarState extends Persisted {
  /** Drawer <768px. No se persiste: siempre arranca cerrado. */
  mobileOpen: boolean;
  /** Carpeta abierta en el acordeón (F6.5 PR3). No se persiste. */
  expandedFolderId: string | null;
  /** `effective` es el estado que se está viendo ahora, no el guardado. */
  toggleCollapsed: (effective: boolean) => void;
  /** Vuelve al default por viewport sin borrar lo persistido. */
  clearUserCollapsed: () => void;
  setWidth: (px: number) => void;
  openMobile: () => void;
  closeMobile: () => void;
  setExpandedFolder: (id: string | null) => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  ...readPersisted(),
  mobileOpen: false,
  expandedFolderId: null,

  // Devuelve el mando al viewport. Lo llama Sidebar al cruzar por debajo de
  // 1024px: la preferencia guardada solo se respeta donde hay ancho para
  // honrarla, si no una elección hecha en escritorio dejaba el sidebar
  // abierto en tablet comiéndose la pantalla. No se persiste el null: la
  // decisión del usuario se conserva para cuando vuelva a haber ancho.
  clearUserCollapsed: () => set({ userCollapsed: null }),

  toggleCollapsed: (effective) => {
    const userCollapsed = !effective;
    set({ userCollapsed });
    persist({ userCollapsed, width: get().width });
  },

  setWidth: (px) => {
    const width = clampSidebarWidth(px);
    set({ width });
    persist({ userCollapsed: get().userCollapsed, width });
  },

  openMobile: () => set({ mobileOpen: true }),
  closeMobile: () => set({ mobileOpen: false }),
  setExpandedFolder: (expandedFolderId) => set({ expandedFolderId }),
}));

/**
 * Escribe el ancho como variable CSS inline en <html>.
 *
 * Vive acá y no en un componente porque el arrastre la llama en cada
 * pointermove SIN pasar por React: si el ancho viviera en un
 * `style={{width}}` del <nav>, cualquier re-render durante el gesto (un
 * refresh() de chats que resuelve, un toast que entra) re-aplicaría el
 * style viejo y el sidebar SALTARÍA hacia atrás a mitad del arrastre. Es
 * un bug intermitente e imposible de reproducir a voluntad.
 */
export function applySidebarWidth(px: number): void {
  document.documentElement.style.setProperty("--sidebar-width", `${String(px)}px`);
}
