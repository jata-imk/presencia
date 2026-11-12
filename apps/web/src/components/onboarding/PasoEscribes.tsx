import { Plus, X } from "lucide-react";
import { useId } from "react";
import { DISTILL_SAMPLES_MAX } from "@presencia/shared";
import { MINIMO_POR_MUESTRA, muestraCorta, muestrasUtiles } from "../../lib/onboarding.js";
import { BotonAtras, BotonPrimario, CAMPO, Etiqueta, Pie, Pista, Titulo } from "./Piezas.js";
import type { PasoProps } from "./PasoHablas.js";

// Paso 2 · ¿Cómo escribes? (Onboarding v2, ScreenEscribes). El corazón del
// onboarding nuevo: evidencia en vez de adjetivos. De estas publicaciones sale
// «Así escribes» (POST /api/brand-voice/destilar), que el creator confirma en
// el último paso.

export function PasoEscribes({
  datos,
  onCambiar,
  onSiguiente,
  onSinMuestras,
  onAtras,
}: PasoProps & { onSiguiente: () => void; onSinMuestras: () => void; onAtras: () => void }) {
  const idNunca = useId();
  const { muestras } = datos;
  const corta = muestraCorta(muestras);
  const puedeSeguir = muestrasUtiles(muestras).length > 0 && corta === null;

  const cambiarMuestra = (i: number, texto: string) =>
    onCambiar({ muestras: muestras.map((m, j) => (j === i ? texto : m)) });

  return (
    <>
      <Titulo sub="Pega 1 a 3 publicaciones tuyas. Aprendemos de cómo escribes de verdad, no de cómo crees que escribes.">
        ¿Cómo escribes?
      </Titulo>

      <div className="flex flex-col gap-2.5">
        {muestras.map((muestra, i) => (
          // El índice es la identidad de la ranura: solo se quitan desde la
          // segunda en adelante y nunca se reordenan.
          <div key={i}>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor={`muestra-${String(i)}`}
                className="font-display text-[11px] font-semibold tracking-wider text-fg-secondary uppercase"
              >
                Publicación {i + 1}
              </label>
              <span className="flex items-center gap-2.5">
                {muestra.length > 0 && (
                  <span className="text-[11.5px] text-fg-muted">{muestra.length} caracteres</span>
                )}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onCambiar({ muestras: muestras.filter((_, j) => j !== i) })}
                    aria-label={`Quitar la publicación ${String(i + 1)}`}
                    className="flex rounded p-0.5 text-fg-muted hover:text-fg"
                  >
                    <X size={14} strokeWidth={1.8} aria-hidden />
                  </button>
                )}
              </span>
            </div>
            <textarea
              id={`muestra-${String(i)}`}
              rows={i === 0 ? 7 : 4}
              value={muestra}
              maxLength={1200}
              onChange={(e) => cambiarMuestra(i, e.target.value)}
              placeholder={
                i === 0
                  ? "Pega aquí un post, caption o hilo que hayas publicado. Tal cual, con emojis y todo."
                  : "Otra publicación tuya…"
              }
              aria-invalid={corta === i ? true : undefined}
              className={`${CAMPO} block resize-y leading-relaxed`}
            />
            {corta === i && (
              <p className="mt-1 text-xs text-error-fg">
                Pega la publicación completa: con menos de {MINIMO_POR_MUESTRA} caracteres no
                alcanzamos a ver cómo escribes.
              </p>
            )}
          </div>
        ))}
        {muestras.length < DISTILL_SAMPLES_MAX && (
          <button
            type="button"
            onClick={() => onCambiar({ muestras: [...muestras, ""] })}
            className="flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-line-focus p-2 font-display text-sm font-medium text-brand hover:bg-secondary"
          >
            <Plus size={15} strokeWidth={1.8} aria-hidden />
            Agregar otra
          </button>
        )}
        <button
          type="button"
          onClick={onSinMuestras}
          className="self-start py-0.5 text-[13px] text-brand underline decoration-line-focus underline-offset-3"
        >
          Aún no publico — sáltate esto
        </button>
      </div>

      <section>
        <Etiqueta htmlFor={idNunca} pista="opcional">
          ¿Algo que nunca dirías?
        </Etiqueta>
        <input
          id={idNunca}
          type="text"
          value={datos.nunca}
          maxLength={200}
          onChange={(e) => onCambiar({ nunca: e.target.value })}
          placeholder="«¡Hola, familia!», «emprendedor», demasiados emojis…"
          className={CAMPO}
        />
      </section>

      {!puedeSeguir && corta === null && (
        <Pista>Pega al menos una publicación, o sáltate este paso</Pista>
      )}
      <Pie>
        <BotonAtras onClick={onAtras} />
        <BotonPrimario onClick={onSiguiente} disabled={!puedeSeguir}>
          Continuar →
        </BotonPrimario>
      </Pie>
    </>
  );
}
