import { ConfirmDeleteModal } from "../ui/ConfirmDeleteModal.js";
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

  return (
    <ConfirmDeleteModal
      titleId="delete-chat-title"
      title="¿Eliminar esta conversación?"
      description="Se eliminará permanentemente junto con sus mensajes."
      warning={
        <>
          Si tiene publicaciones <strong>programadas</strong>, no se podrá eliminar hasta que las
          canceles o se publiquen. Los borradores y publicaciones ya hechas se mantienen.
        </>
      }
      errorFallback="No se pudo eliminar la conversación."
      onClose={onClose}
      onConfirm={() => remove(chatId)}
      onConfirmed={onDeleted}
    />
  );
}
