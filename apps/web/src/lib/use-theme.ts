import { useEffect } from "react";
import { useMediaQuery } from "./use-media-query.js";
import { useThemeStore, type ThemePreference } from "../stores/theme-store.js";

// Derivación y proyección del tema (ADR-016). El estado es la preferencia
// (theme-store), lo resuelto es esta función pura, y el atributo del DOM
// es la salida — nadie guarda "resolved" en ningún lado.

export type ResolvedTheme = "light" | "dark";

function resolve(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/**
 * El tema que se está viendo ahora mismo. Para el ícono del toggle, que
 * tiene que mostrar el estado actual aunque la preferencia sea "system".
 */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useThemeStore((s) => s.preference);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  return resolve(preference, systemDark);
}

/**
 * Escribe el tema resuelto al `<html>`. Se llama UNA sola vez, en App.tsx.
 *
 * Reaccionar al cambio de tema del SO sale gratis: useMediaQuery ya
 * escucha el evento `change` del MediaQueryList. Si la preferencia es
 * explícita, `resolved` no depende de `systemDark` y el cambio del SO se
 * ignora solo, sin un `if` que lo diga.
 */
export function useThemeSync(): void {
  const resolved = useResolvedTheme();

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    // Sin colorScheme, los controles nativos (scrollbars del SO, inputs
    // de fecha, autofill) siguen pintándose en claro sobre fondo oscuro.
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
}
