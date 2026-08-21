import type { QuotaStatusDto } from "@presencia/shared";
import { Link } from "react-router";
import { formatShortDate } from "../lib/format-date.js";
import { Button } from "./ui/Button.js";
import { Modal } from "./ui/Modal.js";

// Primer overlay real de la app — ahora sobre el shell compartido
// components/ui/Modal.tsx (F6 PR8 follow-up: este componente tenía su
// propia trampa de foco de ~25 líneas escrita a mano; ese motor se
// centralizó en lib/floating/use-dialog.ts + FloatingFocusManager, ver
// el plan de arquitectura de portales). Tono empático, sin rojo agresivo
// ni "Error 402" — "Se te acabó la cuota" en vez de jerga técnica.
export function QuotaExhaustedModal({
  quota,
  onDismiss,
}: {
  quota: QuotaStatusDto;
  onDismiss: () => void;
}) {
  return (
    <Modal onClose={onDismiss} labelledBy="quota-exhausted-title" maxWidth="max-w-sm">
      <div className="text-center">
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
    </Modal>
  );
}
