import { ConfirmDeleteModal } from "../ui/ConfirmDeleteModal.js";
import { useChannels } from "../../lib/use-channels.js";

// Mismo ConfirmDeleteModal que ModalDeleteChat.tsx (code review
// 2026-08-20, antes eran casi copias exactas) — a diferencia de las
// chats, acá no hay store compartido (channels vive en el hook casero
// useChannels, no en zustand); deleteForever no necesita estado
// compartido con la página que abre el modal, solo el callback onDeleted
// para que refresque.
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

  return (
    <ConfirmDeleteModal
      titleId="delete-channel-title"
      title={`¿Eliminar ${networkLabel} para siempre?`}
      description={
        "Ya no aparecerá en ninguna vista. Para volver a usarla tendrías que reautorizarla de " +
        'nuevo en postfa.st desde "Conectar red".'
      }
      warning={
        <>
          Si tiene publicaciones <strong>programadas</strong>, no se podrá eliminar hasta que las
          canceles o se publiquen.
        </>
      }
      errorFallback="No se pudo eliminar esta cuenta."
      onClose={onClose}
      onConfirm={() => deleteForever(accountId)}
      onConfirmed={onDeleted}
    />
  );
}
