import {
  Archive,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, Menu } from "../ui/Menu.js";
import { ModalDeleteChat } from "./ModalDeleteChat.js";
import { ModalMoveToFolder } from "./ModalMoveToFolder.js";
import { ApiError } from "../../lib/api.js";
import { useChatsStore } from "../../stores/chats-store.js";

const TRIGGER_CLASS =
  "flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary-hover";
const ITEM_CLASS = MENU_ITEM_CLASS;
const CONTENT_CLASS = MENU_CONTENT_CLASS;

// Menú "···" de un chat (Renombrar/Mover a carpeta/Exportar/Archivar/
// Eliminar) — reusado en ConvHeader (header de la conversación) y en cada
// fila de "Recientes" del Sidebar (F6 PR8 follow-up: Jose pidió las
// mismas opciones ahí, no solo dentro de la conversación abierta). Sobre
// <Menu> (components/ui/Menu.tsx) desde el rework a floating-ui — antes
// tenía su propio getBoundingClientRect()/openUpward a mano para no
// cortarse contra el borde del sidebar; ahora lo resuelve flip()+shift().
//
// Renombrar es la única acción que no vive acá: cada layout (header a
// ancho completo, fila angosta del sidebar) edita el título distinto —
// `onRenameRequest` deja que el caller decida qué significa "empezar a
// editar" en su propio layout.
export function ChatOptionsMenu({
  chatId,
  folderId,
  onRenameRequest,
}: {
  chatId: string;
  folderId: string | null;
  onRenameRequest: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const chats = useChatsStore((s) => s.chats);
  const archive = useChatsStore((s) => s.archive);
  const setPinned = useChatsStore((s) => s.setPinned);
  const [showMove, setShowMove] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const chat = chats?.find((c) => c.id === chatId);
  const title = chat?.title ?? "";
  const isPinned = chat?.pinnedAt != null;
  // `chats` solo trae los NO archivados. Si el chat no está ahí, o es
  // archivado (se llega desde /chats/archivados) o la lista todavía no
  // cargó — en ninguno de los dos casos tiene sentido ofrecer "Fijar":
  // el backend responde 409 para un archivado y el usuario no vería nada.
  const canPin = chat !== undefined;
  const isCurrentChat = location.pathname === `/chats/${chatId}`;

  async function handleTogglePin() {
    setPinning(true);
    setPinError(null);
    try {
      await setPinned(chatId, !isPinned);
    } catch (err) {
      // Mismo criterio que handleArchive: un fallo se muestra, no se
      // traga como unhandled rejection.
      setPinError(err instanceof ApiError ? err.message : "No se pudo fijar.");
    } finally {
      setPinning(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      await archive(chatId);
      if (isCurrentChat) void navigate("/chats");
    } catch {
      setArchiveError("No se pudo archivar.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <>
      <Menu>
        <Menu.Trigger aria-label="Más opciones" className={TRIGGER_CLASS}>
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </Menu.Trigger>
        <Menu.Content className={CONTENT_CLASS}>
          {canPin && (
            <Menu.Item
              onClick={() => void handleTogglePin()}
              disabled={pinning}
              className={ITEM_CLASS}
            >
              {isPinned ? (
                <PinOff size={13} strokeWidth={1.75} />
              ) : (
                <Pin size={13} strokeWidth={1.75} />
              )}
              {isPinned ? "Quitar de fijados" : "Fijar"}
            </Menu.Item>
          )}
          {pinError && <p className="px-2.5 py-1 text-[11px] text-error">{pinError}</p>}
          <Menu.Item onClick={onRenameRequest} className={ITEM_CLASS}>
            <Pencil size={13} strokeWidth={1.75} />
            Renombrar
          </Menu.Item>
          <Menu.Item onClick={() => setShowMove(true)} className={ITEM_CLASS}>
            <FolderInput size={13} strokeWidth={1.75} />
            Mover a carpeta
          </Menu.Item>
          <Menu.Item disabled title="Próximamente" className={`${ITEM_CLASS} text-fg-muted`}>
            <Share2 size={13} strokeWidth={1.75} />
            Exportar
          </Menu.Item>
          <Menu.Item
            onClick={() => void handleArchive()}
            disabled={archiving}
            className={ITEM_CLASS}
          >
            <Archive size={13} strokeWidth={1.75} />
            {archiving ? "Archivando…" : "Archivar"}
          </Menu.Item>
          {archiveError && <p className="px-2.5 py-1 text-[11px] text-error">{archiveError}</p>}
          <div className="my-1 h-px bg-line" />
          <Menu.Item
            onClick={() => setShowDelete(true)}
            className={`${ITEM_CLASS} text-error hover:bg-error-bg`}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            Eliminar
          </Menu.Item>
        </Menu.Content>
      </Menu>

      {showMove && (
        <ModalMoveToFolder
          chatId={chatId}
          chatTitle={title}
          currentFolderId={folderId}
          onClose={() => setShowMove(false)}
          onMoved={() => setShowMove(false)}
        />
      )}
      {showDelete && (
        <ModalDeleteChat
          chatId={chatId}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            if (isCurrentChat) void navigate("/chats");
          }}
        />
      )}
    </>
  );
}
