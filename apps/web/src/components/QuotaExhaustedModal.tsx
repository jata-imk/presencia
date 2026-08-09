import { useEffect, useRef } from "react";
import type { QuotaStatusDto } from "@presencia/shared";
import { Link } from "react-router";
import { Button } from "./ui/Button.js";

// Primer overlay real de la app (apps/web/src no tenía ningún <dialog>,
// portal ni backdrop hasta este componente) — el resto de modales del
// producto lo va a copiar. Bloqueante (necesita acción, presencia-chat.md
// §4): foco atrapado en el contenedor, Esc cierra. Tono empático, sin rojo
// agresivo ni "Error 402" — "Se te acabó la cuota" en vez de jerga técnica.
export function QuotaExhaustedModal({
  quota,
  onDismiss,
}: {
  quota: QuotaStatusDto;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  const renewsAtLabel = new Date(quota.renewsAt).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quota-exhausted-title"
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 text-center shadow-lg outline-none"
      >
        <h2 id="quota-exhausted-title" className="text-lg font-bold text-fg">
          Se te acabó la cuota de este mes
        </h2>
        <p className="mt-2 text-sm text-fg-secondary">
          Te alcanza para 0 publicaciones más. Renueva el {renewsAtLabel}.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            to="/configuracion/plan"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            Ver opciones de upgrade
          </Link>
          <Button variant="secondary" onClick={onDismiss}>
            Esperar al próximo ciclo
          </Button>
        </div>
      </div>
    </div>
  );
}
