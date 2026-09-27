import { HardHat } from "lucide-react";
import { useLocation } from "react-router";
import { seccionActiva } from "./layout.js";

// Plantillas y Facturación: navegables (F9.7, mock de Claude Design) en vez
// de un ítem gris que no dice por qué no responde.
export function ProximamentePage() {
  const { pathname } = useLocation();
  const nombre = seccionActiva(pathname)?.label ?? "esta sección";

  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-5.5 flex size-22 items-center justify-center rounded-3xl bg-secondary">
        <HardHat size={38} strokeWidth={1.5} className="text-ai" aria-hidden />
      </div>
      <h1 className="mb-2 font-display text-xl font-bold text-brand">Próximamente</h1>
      <p className="max-w-90 text-base leading-relaxed text-fg-secondary">
        Estamos trabajando en <b className="text-brand">{nombre}</b>. Muy pronto vas a poder
        configurarla desde aquí.
      </p>
    </div>
  );
}
