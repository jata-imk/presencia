import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { EncabezadoDePagina, Seccion } from "../../components/configuracion/primitivas.js";
import { useResolvedTheme } from "../../lib/use-theme.js";
import { useThemeStore, type ThemePreference } from "../../stores/theme-store.js";

// Configuración > Apariencia — la home canónica del tema (overview §3:
// grupo CUENTA). El toggle del Topbar es un atajo de dos estados; acá
// está la tercera opción, "Sistema", que es el default.
//
// Sin marca de "Guardado" a propósito: el cambio se ve en toda la pantalla
// al instante, que es su propia confirmación.

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
    <div>
      <EncabezadoDePagina
        titulo="Apariencia"
        subtitulo="Elige cómo se ve Presencia. Se guarda en este navegador."
      />

      <Seccion icono={Palette} titulo="Tema">
        <div role="radiogroup" aria-label="Tema" className="grid gap-2.5 md:grid-cols-3">
          {OPTIONS.map((opt) => {
            const active = preference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(opt.value)}
                className={`flex items-start gap-3 rounded-lg border-[1.5px] p-3.5 text-left transition-colors ${
                  active
                    ? "border-line-focus bg-tint-plum"
                    : "border-line bg-card hover:bg-secondary"
                }`}
              >
                <opt.icon
                  size={17}
                  strokeWidth={1.5}
                  className={`mt-0.5 shrink-0 ${active ? "text-brand" : "text-fg-muted"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-fg">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-secondary">
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
      </Seccion>
    </div>
  );
}
