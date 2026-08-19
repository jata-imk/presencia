import { Info, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useChannels } from "../../lib/use-channels.js";

// Mismo esqueleto que ModalDeleteChat.tsx — a diferencia de las chats, acá
// no hay store compartido (channels vive en el hook casero useChannels,
// no en zustand); deleteForever no necesita estado compartido con la
// página que abre el modal, solo el callback onDeleted para que refresque.
export function ModalDeleteChannel({
  accountId,
  networkLabel,
  onClose,
  onDeleted,
}: {
  accountId: string;
  networkLabel: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { deleteForever } = useChannels();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      await deleteForever(accountId);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar esta cuenta.");
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="delete-channel-title" maxWidth="max-w-sm">
      <div className="flex justify-center">
        <div className="flex size-[52px] items-center justify-center rounded-full bg-error-bg">
          <Trash2 size={22} strokeWidth={1.75} className="text-error" />
        </div>
      </div>
      <h2 id="delete-channel-title" className="mt-3.5 text-center text-lg font-bold text-fg">
        ¿Eliminar {networkLabel} para siempre?
      </h2>
      <p className="mt-1.5 text-center text-sm text-fg-secondary">
        Ya no aparecerá en ninguna vista. Para volver a usarla tendrías que reautorizarla de nuevo
        en postfa.st desde "Conectar red".
      </p>
      <div className="mt-4 flex gap-2 rounded-lg border border-line-focus bg-tint-plum p-3">
        <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-xs text-fg-secondary">
          Si tiene publicaciones <strong>programadas</strong>, no se podrá eliminar hasta que las
          canceles o se publiquen.
        </p>
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1">
          Cancelar
        </Button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={submitting}
          className="flex-1 rounded-md bg-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </Modal>
  );
}
