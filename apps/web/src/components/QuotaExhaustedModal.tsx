import { useEffect, useRef } from "react";
import type { QuotaStatusDto } from "@presencia/shared";
import { Link } from "react-router";
import { formatShortDate } from "../lib/format-date.js";
import { Button } from "./ui/Button.js";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Primer overlay real de la app (apps/web/src no tenía ningún <dialog>,
// portal ni backdrop hasta este componente) — el resto de modales del
// producto lo va a copiar. Bloqueante (necesita acción, presencia-chat.md
// §4): foco inicial + trampa de Tab dentro del contenedor, Esc cierra. Tono
// empático, sin rojo agresivo ni "Error 402" — "Se te acabó la cuota" en vez
// de jerga técnica.
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
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      // Trampa de foco: sin esto Tab se escapa hacia el chat de atrás, que
      // sigue montado bajo el overlay — rompe el "bloqueante" del diseño.
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

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
          Te alcanza para 0 publicaciones más. Renueva el {formatShortDate(quota.renewsAt)}.
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
