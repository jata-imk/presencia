import { Info, Trash2, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Modal } from "./Modal.js";
import { Button } from "./Button.js";
import { ApiError } from "../../lib/api.js";

// Esqueleto compartido de "eliminar con confirmación" (code review
// 2026-08-20) — antes ModalDeleteChat.tsx y ModalDeleteChannel.tsx eran
// casi copias exactas (mismo círculo de ícono, mismo layout de
// título/descripción, mismo aviso, misma máquina de estado
// submitting/error, mismo par de botones), solo cambiaba el copy y qué
// mutación se llama. Un futuro ajuste de esta UI (espaciado, a11y, copy
// de carga) se aplica una vez, no dos veces sin garantía de que queden
// sincronizadas.
//
// F11 PR7a: también confirma desconectar Telegram, que no borra nada: por eso
// el ícono se puede cambiar y el aviso es opcional.
export function ConfirmDeleteModal({
  titleId,
  title,
  description,
  warning,
  icon: Icon = Trash2,
  confirmLabel = "Eliminar",
  confirmingLabel = "Eliminando…",
  errorFallback,
  onClose,
  onConfirm,
  onConfirmed,
}: {
  titleId: string;
  title: string;
  description: ReactNode;
  warning?: ReactNode;
  icon?: LucideIcon;
  confirmLabel?: string;
  confirmingLabel?: string;
  errorFallback: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onConfirmed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onConfirmed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : errorFallback);
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidth="max-w-sm">
      <div className="flex justify-center">
        <div className="flex size-[52px] items-center justify-center rounded-full bg-error-bg">
          <Icon size={22} strokeWidth={1.75} className="text-error" aria-hidden />
        </div>
      </div>
      <h2 id={titleId} className="mt-3.5 text-center text-lg font-bold text-fg">
        {title}
      </h2>
      <p className="mt-1.5 text-center text-sm text-fg-secondary">{description}</p>
      {warning && (
        <div className="mt-4 flex gap-2 rounded-lg border border-line-focus bg-tint-plum p-3">
          <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-fg-secondary">{warning}</p>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1">
          Cancelar
        </Button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={submitting}
          className="flex-1 rounded-md bg-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? confirmingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
