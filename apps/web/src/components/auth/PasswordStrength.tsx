import { Check } from "lucide-react";
import { fuerzaDeContrasena, NIVELES } from "../../lib/auth/validar.js";

// Medidor de fuerza de la contraseña (Auth Flow.html): cuatro barras, el
// nombre del nivel y los cuatro criterios. Los colores salen de los tokens de
// estado, no de la escala roja/naranja/amarilla/verde del mock.

const BARRA = ["", "bg-error", "bg-warning", "bg-success/70", "bg-success"] as const;
const TEXTO = [
  "",
  "text-error-fg",
  "text-warning-fg",
  "text-success-fg",
  "text-success-fg",
] as const;

const CRITERIOS = [
  { clave: "largo", texto: "Mínimo 8 caracteres" },
  { clave: "mayuscula", texto: "Una mayúscula" },
  { clave: "numero", texto: "Un número" },
  { clave: "simbolo", texto: "Un símbolo" },
] as const;

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { criterios, puntos } = fuerzaDeContrasena(password);
  return (
    <div className="flex animate-[aparecer_180ms_ease-out] flex-col gap-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${i <= puntos ? BARRA[puntos] : "bg-line"}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${TEXTO[puntos]}`}>
        <span className="sr-only">Fuerza de la contraseña: </span>
        {NIVELES[puntos]}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {CRITERIOS.map(({ clave, texto }) => {
          const ok = criterios[clave];
          return (
            <li key={clave} className="flex items-center gap-1.5">
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                  ok ? "border-success bg-success-bg text-success-fg" : "border-line bg-secondary"
                }`}
              >
                {ok && <Check size={9} strokeWidth={3} aria-hidden />}
              </span>
              <span className={`text-xs ${ok ? "text-fg-secondary" : "text-fg-muted"}`}>
                {texto}
                <span className="sr-only">{ok ? " (cumple)" : " (falta)"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
