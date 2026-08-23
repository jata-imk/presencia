import { FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import { ModalNewFolder } from "../folders/ModalNewFolder.js";
import { ApiError } from "../../lib/api.js";
import { useChatsStore } from "../../stores/chats-store.js";
import { useFoldersStore } from "../../stores/folders-store.js";

// Portado de ModalMoveToFolder (Chat Part 3.html). El buscador de carpetas
// del mockup se omite si hay pocas — se agrega solo cuando la lista real lo
// justifique (nadie tiene más de un puñado de carpetas todavía, F6 es la
// primera versión de esto).
export function ModalMoveToFolder({
  chatId,
  chatTitle,
  currentFolderId,
  onClose,
  onMoved,
}: {
  chatId: string;
  chatTitle: string;
  currentFolderId: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const folders = useFoldersStore((s) => s.folders);
  const refreshFolders = useFoldersStore((s) => s.refresh);
  const moveToFolder = useChatsStore((s) => s.moveToFolder);
  const [selected, setSelected] = useState(currentFolderId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (!folders) void refreshFolders();
  }, [folders, refreshFolders]);

  async function handleMove() {
    setSubmitting(true);
    setError(null);
    try {
      await moveToFolder(chatId, selected);
      onMoved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo mover la conversación.");
    } finally {
      setSubmitting(false);
    }
  }

  if (creatingFolder) {
    return (
      <ModalNewFolder
        onClose={() => setCreatingFolder(false)}
        onCreated={(folderId) => {
          setCreatingFolder(false);
          setSelected(folderId);
        }}
      />
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="move-to-folder-title" maxWidth="max-w-sm">
      <h2 id="move-to-folder-title" className="text-lg font-bold text-fg">
        Mover conversación
      </h2>
      <p className="mt-0.5 truncate text-xs text-fg-secondary">"{chatTitle}"</p>

      <div className="mt-4 flex max-h-60 flex-col gap-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
            selected === null
              ? "border-[1.5px] border-line-focus bg-tint-plum"
              : "border-[1.5px] border-transparent"
          }`}
        >
          <span className="flex-1 text-sm font-medium text-fg">Sin carpeta</span>
        </button>
        {(folders ?? []).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelected(f.id)}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
              selected === f.id
                ? "border-[1.5px] border-line-focus bg-tint-plum"
                : "border-[1.5px] border-transparent"
            }`}
          >
            <span className="shrink-0 text-base">{f.icon ?? "📁"}</span>
            <span className="flex-1 truncate text-sm font-medium text-fg">{f.name}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setCreatingFolder(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-focus px-2.5 py-2 text-left"
      >
        <FolderPlus size={14} className="shrink-0 text-accent" />
        <span className="text-sm font-semibold text-accent">Nueva carpeta…</span>
      </button>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={() => void handleMove()} disabled={submitting} className="flex-1">
          {submitting ? "Moviendo…" : "Mover"}
        </Button>
      </div>
    </Modal>
  );
}
