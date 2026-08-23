import { Monitor, Moon, Sun } from "lucide-react";
import { useResolvedTheme } from "../../lib/use-theme.js";
import { useThemeStore, type ThemePreference } from "../../stores/theme-store.js";

// Configuración > Apariencia — la home canónica del tema (overview §3:
// grupo CUENTA). El toggle del Topbar es un atajo de dos estados; acá
// está la tercera opción, "Sistema", que es el default.

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun; hint: string }[] = [
  { value: "light", label: "Claro", icon: Sun, hint: "Siempre claro." },
  { value: "dark", label: "Oscuro", icon: Moon, hint: "Siempre oscuro." },
  {
    value: "system",
    label: "Sistema",
    icon: Monitor,
    hint: "Sigue la configuración de tu dispositivo.",
  },
];

export function AparienciaPage() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const resolved = useResolvedTheme();

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-fg">Apariencia</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          Elige cómo se ve Presencia. Se guarda en este navegador.
        </p>
      </div>

      <div role="radiogroup" aria-label="Tema" className="flex flex-col gap-2">
        {OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(opt.value)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? "border-brand bg-tint-plum"
                  : "border-line bg-card hover:bg-secondary-hover"
              }`}
            >
              <opt.icon
                size={16}
                strokeWidth={1.75}
                className={`shrink-0 ${active ? "text-brand" : "text-fg-muted"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{opt.label}</span>
                <span className="block text-xs text-fg-secondary">
                  {opt.hint}
                  {/* Con "Sistema" seleccionado, decir qué está resolviendo
                      ahora — si no, el usuario no tiene forma de saber por
                      qué ve lo que ve. */}
                  {opt.value === "system" &&
                    active &&
                    ` Ahora mismo: ${resolved === "dark" ? "oscuro" : "claro"}.`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
