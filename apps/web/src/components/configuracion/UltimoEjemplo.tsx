import { RefreshCw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import type { BrandVoiceExampleDto, QuotaStatusDto } from "@presencia/shared";
import { ApiError, apiFetch } from "../../lib/api.js";
import { cuotaAgotadaDe } from "../../lib/cuota-agotada.js";
import { haceCuanto } from "../../lib/ritmo/tendencias.js";
import { QuotaExhaustedModal } from "../QuotaExhaustedModal.js";

// "Ver ejemplo de tu voz" (F9.7), en línea desde F12.5 (Claude Design "Voz de
// marca v3"): un post de muestra escrito con la voz GUARDADA. Ya no es un
// modal que se pierde al cerrarlo: el servidor guarda el último (sin
// historial) y aquí se muestra al volver.
//
// - Manual, nunca automático: regenerar en cada cambio sería cobrar por
//   configurar. Por eso es un botón.
// - Sin precio en el botón (addendum ADR-012). El mock traía "≈2 créditos".
// - Antes de pedirlo se manda lo pendiente del autoguardado (`antesDePedir`):
//   si no, un cambio de hace medio segundo quedaría fuera del ejemplo.

interface UltimoEjemploProps {
  ultimo: BrandVoiceExampleDto | null;
  /** La voz cambió después de escribir el último: se dice, para que no engañe. */
  vozCambio: boolean;
  /** Manda y espera lo pendiente del autoguardado; `false` si algo no se guardó. */
  antesDePedir: () => Promise<boolean>;
  onNuevo: (ejemplo: BrandVoiceExampleDto) => void;
}

export function UltimoEjemplo({ ultimo, vozCambio, antesDePedir, onNuevo }: UltimoEjemploProps) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuota, setCuota] = useState<QuotaStatusDto | null>(null);
  // Un pedido viejo que vuelve tarde no pisa uno nuevo (mismo patrón de antes).
  const turno = useRef(0);

  async function pedir() {
    const mio = ++turno.current;
    setGenerando(true);
    setError(null);
    try {
      if (!(await antesDePedir())) {
        if (mio === turno.current) {
          setError(
            "No pudimos guardar tus últimos cambios, así que el ejemplo no sonaría a tu voz actual. Revisa los campos marcados y vuelve a intentarlo.",
          );
        }
        return;
      }
      const ejemplo = await apiFetch<BrandVoiceExampleDto>("/api/brand-voice/ejemplo", {
        method: "POST",
      });
      if (mio === turno.current) onNuevo(ejemplo);
    } catch (e) {
      if (mio !== turno.current) return;
      const agotada = cuotaAgotadaDe(e);
      if (agotada) setCuota(agotada);
      else setError(e instanceof ApiError ? e.message : "No pudimos escribir el ejemplo.");
    } finally {
      if (mio === turno.current) setGenerando(false);
    }
  }

  return (
    <div className="border-t border-line-subtle pt-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
          <Sparkles size={16} strokeWidth={1.6} className="text-accent" aria-hidden />
          {ultimo ? "Tu último ejemplo" : "Escucha cómo suenas"}
          {ultimo && (
            <span className="font-body text-xs font-normal text-fg-muted">
              · {haceCuanto(ultimo.generatedAt)}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void pedir()}
          disabled={generando}
          className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-line-focus bg-secondary px-3 py-1.5 font-display text-[12.5px] font-semibold text-brand transition-colors hover:bg-secondary-hover disabled:opacity-60"
        >
          <RefreshCw
            size={14}
            strokeWidth={1.8}
            className={generando ? "motion-safe:animate-spin" : ""}
            aria-hidden
          />
          {ultimo ? "Regenerar" : "Ver ejemplo de tu voz"}
        </button>
      </div>

      <div aria-live="polite">
        {generando ? (
          <div aria-busy="true" className="rounded-lg border border-line-subtle bg-surface p-4">
            {["w-[70%]", "w-full", "w-[88%] mb-4", "w-[92%]", "w-[54%]"].map((ancho) => (
              <div key={ancho} className={`skeleton mb-2.5 h-3.5 rounded-md ${ancho}`} />
            ))}
            <p className="mt-3 font-display text-xs font-medium text-accent">
              Escribiendo con tu voz…
            </p>
          </div>
        ) : ultimo ? (
          <>
            {vozCambio && (
              <p className="mb-2 text-xs text-warning-fg">
                Tu voz cambió desde este ejemplo. Regenéralo para escuchar cómo suena ahora.
              </p>
            )}
            <p className="rounded-lg border border-line-subtle bg-surface px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
              {ultimo.text}
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">
            Escribimos un post de muestra con tu voz tal como está guardada, para que la escuches.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-error-fg">
            {error}
          </p>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] text-fg-muted">
        Guardamos solo el último ejemplo generado. No es un borrador ni va a tu Biblioteca.
      </p>

      {cuota && <QuotaExhaustedModal quota={cuota} onDismiss={() => setCuota(null)} />}
    </div>
  );
}
