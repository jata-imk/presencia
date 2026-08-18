import { Info, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useChatsStore } from "../../stores/chats-store.js";

// Portado de ModalDelete (Chat Part 3.html) — el aviso azul del mockup dice
// "las publicaciones programadas y los posts en biblioteca se mantendrán".
// Eso ya no es del todo cierto tal cual (ver ChatService.deleteChat,
// F6 PR8): las programadas BLOQUEAN el borrado en vez de sobrevivir en
// silencio — cancelar un post real sin que el usuario lo pidiera sería un
// bug. El resto (draft/published/failed) sí sobrevive huérfano. El aviso
// de acá refleja eso, no la copy original del mockup.
export function ModalDeleteChat({
  chatId,
  onClose,
  onDeleted,
}: {
  chatId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useChatsStore((s) => s.remove);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      await remove(chatId);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar la conversación.");
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="delete-chat-title" maxWidth="max-w-sm">
      <div className="flex justify-center">
        <div className="flex size-[52px] items-center justify-center rounded-full bg-error-bg">
          <Trash2 size={22} strokeWidth={1.75} className="text-error" />
        </div>
      </div>
      <h2 id="delete-chat-title" className="mt-3.5 text-center text-lg font-bold text-fg">
        ¿Eliminar esta conversación?
      </h2>
      <p className="mt-1.5 text-center text-sm text-fg-secondary">
        Se eliminará permanentemente junto con sus mensajes.
      </p>
      <div className="mt-4 flex gap-2 rounded-lg border border-line-focus bg-tint-plum p-3">
        <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-xs text-fg-secondary">
          Si tiene publicaciones <strong>programadas</strong>, no se podrá eliminar hasta que las
          canceles o se publiquen. Los borradores y publicaciones ya hechas se mantienen.
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
