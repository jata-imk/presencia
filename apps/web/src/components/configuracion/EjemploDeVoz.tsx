import { Info, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { BrandVoiceExampleDto, QuotaStatusDto } from "@presencia/shared";
import { ApiError, apiFetch } from "../../lib/api.js";
import { cuotaAgotadaDe } from "../../lib/cuota-agotada.js";
import { QuotaExhaustedModal } from "../QuotaExhaustedModal.js";
import { Modal } from "../ui/Modal.js";

// "Ver ejemplo de tu voz" (F9.7, doc de Voz de marca §5, mock de Claude
// Design). Un post de muestra escrito con la voz GUARDADA.
//
// - Sin precio en el botón: el mock traía "≈2 créditos" y el addendum de
//   ADR-012 prohíbe mostrar números crudos. El costo se ve en la cuota.
// - Antes de pedirlo se manda lo que el autoguardado tenga pendiente
//   (`antesDePedir`): si no, un cambio de hace medio segundo quedaría fuera
//   del ejemplo y el usuario escucharía su voz de antes.
// - El texto no se guarda en ningún lado, y el modal lo dice.

interface EjemploDeVozProps {
  antesDePedir: () => Promise<void>;
}

type Estado =
  | { tipo: "cerrado" }
  | { tipo: "generando" }
  | { tipo: "listo"; texto: string }
  | { tipo: "error"; mensaje: string };

export function EjemploDeVoz({ antesDePedir }: EjemploDeVozProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cerrado" });
  const [cuota, setCuota] = useState<QuotaStatusDto | null>(null);

  async function pedir() {
    setEstado({ tipo: "generando" });
    try {
      await antesDePedir();
      const { text } = await apiFetch<BrandVoiceExampleDto>("/api/brand-voice/ejemplo", {
        method: "POST",
      });
      setEstado({ tipo: "listo", texto: text });
    } catch (e) {
      const agotada = cuotaAgotadaDe(e);
      if (agotada) {
        setEstado({ tipo: "cerrado" });
        setCuota(agotada);
        return;
      }
      setEstado({
        tipo: "error",
        mensaje: e instanceof ApiError ? e.message : "No pudimos escribir el ejemplo.",
      });
    }
  }

  const cerrar = () => setEstado({ tipo: "cerrado" });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-105 text-sm leading-normal text-fg-muted">
          Genera un post de ejemplo con tu configuración actual para escuchar cómo suena.
        </p>
        <button
          type="button"
          onClick={() => void pedir()}
          disabled={estado.tipo === "generando"}
          className="inline-flex shrink-0 items-center gap-2.5 rounded-lg border-[1.5px] border-line-focus bg-secondary px-4 py-2.75 font-display text-sm font-semibold text-brand transition-colors hover:bg-secondary-hover disabled:opacity-60"
        >
          <Sparkles size={16} strokeWidth={1.6} className="text-accent" aria-hidden />
          Ver ejemplo de tu voz
        </button>
      </div>

      {estado.tipo !== "cerrado" && (
        <Modal onClose={cerrar} labelledBy="ejemplo-de-voz-titulo" maxWidth="max-w-135">
          <div className="-m-6">
            <div className="flex items-center gap-2.5 border-b border-line px-5 pt-4.5 pb-3.5">
              <Sparkles size={18} strokeWidth={1.6} className="text-accent" aria-hidden />
              <h2
                id="ejemplo-de-voz-titulo"
                className="flex-1 font-display text-md font-bold text-fg"
              >
                Ejemplo de tu voz
              </h2>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="flex size-7.5 items-center justify-center rounded-md text-fg-secondary hover:bg-secondary"
              >
                <X size={16} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="px-5 pt-2">
              <div className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3 py-2.25 text-xs text-fg">
                <Info size={14} className="shrink-0 text-info-fg" aria-hidden />
                Este es solo un ejemplo, no se guarda.
              </div>
            </div>

            <div
              className="max-h-[55dvh] min-h-45 overflow-y-auto px-5 pt-4 pb-5"
              aria-live="polite"
            >
              {estado.tipo === "generando" && (
                <div aria-busy="true">
                  {["w-[92%]", "w-full", "w-[78%] mb-5.5", "w-[88%]", "w-[64%]"].map((ancho) => (
                    <div key={ancho} className={`skeleton mb-2.75 h-3.5 rounded-md ${ancho}`} />
                  ))}
                  <p className="mt-5 flex items-center gap-1.75 font-display text-xs font-medium text-accent">
                    <RefreshCw size={14} className="motion-safe:animate-spin" aria-hidden />
                    Generando con tu voz…
                  </p>
                </div>
              )}
              {estado.tipo === "listo" && (
                <p className="text-base leading-relaxed whitespace-pre-wrap text-fg">
                  {estado.texto}
                </p>
              )}
              {estado.tipo === "error" && (
                <p role="alert" className="text-sm text-error-fg">
                  {estado.mensaje}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-line bg-surface px-5 py-3.5">
              <button
                type="button"
                onClick={() => void pedir()}
                disabled={estado.tipo === "generando"}
                className="inline-flex items-center gap-1.75 rounded-lg border-[1.5px] border-line-focus bg-card px-3.5 py-2 font-display text-[12.5px] font-semibold text-brand hover:bg-secondary disabled:opacity-60"
              >
                <RefreshCw size={14} strokeWidth={1.8} aria-hidden />
                {estado.tipo === "error" ? "Reintentar" : "Regenerar"}
              </button>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg bg-primary px-4.5 py-2.25 font-display text-[12.5px] font-semibold text-primary-fg hover:bg-primary-hover"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cuota && <QuotaExhaustedModal quota={cuota} onDismiss={() => setCuota(null)} />}
    </>
  );
}
