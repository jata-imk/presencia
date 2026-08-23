import { create } from "zustand";

// F6.5 PR4: preferencia de tema (ADR-016).
//
// Lo que se guarda es LA PREFERENCIA, no el tema resuelto. "system" es el
// default y hace de null: mientras esté puesto, manda prefers-color-scheme
// del SO y cambia en vivo si el usuario cambia el tema del sistema. En
// cuanto elige claro u oscuro explícito, esa decisión gana. Es el mismo
// patrón que sidebar-store.ts con `userCollapsed: boolean | null`.
//
// Nadie guarda el tema "resuelto" en ningún lado: se deriva en
// lib/use-theme.ts y se proyecta al atributo del DOM. Una sola fuente de
// verdad (la preferencia), una función pura, y el DOM como salida.
//
// La clave y los valores están espejados en el script anti-FOUC de
// index.html, que no puede importar este archivo porque corre antes del
// bundle. Si cambian acá, cambian allá.

export const THEME_STORAGE_KEY = "presencia.theme";

export type ThemePreference = "light" | "dark" | "system";

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage puede tirar (Safari en privado). No es motivo para
    // no cargar la app: "system" es un default razonable.
  }
  return "system";
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: readPreference(),
  setPreference: (preference) => {
    set({ preference });
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Sin persistencia el tema sigue funcionando, solo se olvida.
    }
  },
}));
