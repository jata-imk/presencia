import { Moon, Sun } from "lucide-react";
import { useResolvedTheme } from "../../lib/use-theme.js";
import { useThemeStore } from "../../stores/theme-store.js";

// Atajo de tema del Topbar (overview §5: "Toggle modo claro/oscuro, icono
// sun/moon"). La home canónica de la preferencia es Configuración >
// Apariencia, que además ofrece "Sistema"; esto es de dos estados a
// propósito — un click acá siempre fija una preferencia explícita.
//
// El ícono muestra el estado ACTUAL y el aria-label dice la ACCIÓN: el
// ícono comunica dónde estás, el label qué pasa si lo tocás.
export function ThemeToggle() {
  const resolved = useResolvedTheme();
  const setPreference = useThemeStore((s) => s.setPreference);
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={next === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      title={next === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary-hover"
    >
      {resolved === "dark" ? (
        <Moon size={15} strokeWidth={1.75} />
      ) : (
        <Sun size={15} strokeWidth={1.75} />
      )}
    </button>
  );
}
