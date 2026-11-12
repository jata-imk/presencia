import { CircleDollarSign, Clock, RefreshCcw, TrendingUp, type LucideIcon } from "lucide-react";
import { METAS, type MetaId } from "../../lib/onboarding.js";
import { BotonAtras, BotonPrimario, BotonSecundario, Pie, Titulo } from "./Piezas.js";
import type { PasoProps } from "./PasoHablas.js";

// Paso 4 · ¿Qué buscas con tu contenido? (Onboarding v2, ScreenMetas).
//
// Diferencia con el mock: no hay chip "Principal". El mock decía "el primero
// marca el ritmo de tu plan", pero el Modo se deriva de TODAS las metas
// (`modoDeGoals`), y prometer otra cosa sería mentir. El texto dice lo que de
// verdad pasa con la respuesta.

const ICONOS: Record<MetaId, LucideIcon> = {
  crecer: TrendingUp,
  monetizar: CircleDollarSign,
  consistencia: RefreshCcw,
  tiempo: Clock,
};

export function PasoMetas({
  datos,
  onCambiar,
  onSiguiente,
  onSaltar,
  onAtras,
  guardando,
  error,
}: PasoProps & {
  onSiguiente: () => void;
  /** Sigue sin guardar metas, aunque haya tocado alguna. */
  onSaltar: () => void;
  onAtras: () => void;
  guardando: boolean;
  error: string | null;
}) {
  const alternar = (id: MetaId) =>
    onCambiar({
      metas: datos.metas.includes(id) ? datos.metas.filter((m) => m !== id) : [...datos.metas, id],
    });

  return (
    <>
      <Titulo sub="Elige una o varias. Con esto ajustamos cuántas publicaciones por semana te proponemos.">
        ¿Qué buscas con tu contenido?
      </Titulo>

      <div className="grid grid-cols-1 gap-2 min-[521px]:grid-cols-2">
        {METAS.map(({ id, label, descripcion }) => {
          const elegida = datos.metas.includes(id);
          const Icono = ICONOS[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={elegida}
              onClick={() => alternar(id)}
              className={`flex flex-col gap-2 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition-colors ${
                elegida
                  ? "border-line-focus bg-tint-plum shadow-sm"
                  : "border-line bg-card hover:bg-secondary"
              }`}
            >
              <span
                className={`flex size-8.5 items-center justify-center rounded-[10px] ${
                  elegida ? "bg-card text-brand" : "bg-secondary text-fg-muted"
                }`}
              >
                <Icono size={18} strokeWidth={1.6} aria-hidden />
              </span>
              <span>
                <span
                  className={`mb-0.75 block font-display text-[13px] font-semibold ${elegida ? "text-brand" : "text-fg"}`}
                >
                  {label}
                </span>
                <span className="block text-[11.5px] leading-snug text-fg-muted">
                  {descripcion}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-error-fg">
          {error}
        </p>
      )}
      <Pie>
        <BotonAtras onClick={onAtras} />
        <BotonSecundario onClick={onSaltar} disabled={guardando}>
          Saltar
        </BotonSecundario>
        <BotonPrimario onClick={onSiguiente} disabled={guardando || datos.metas.length === 0}>
          {guardando ? "Guardando…" : "Continuar →"}
        </BotonPrimario>
      </Pie>
    </>
  );
}
