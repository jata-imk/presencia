import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatsStore } from "../../stores/chats-store.js";
import { useFoldersStore } from "../../stores/folders-store.js";
import { ChatOptionsMenu } from "./ChatOptionsMenu.js";

// "Carpeta / Título ▾" en la Topbar de una conversación (F10.6.2). Antes
// eran dos filas: la Topbar decía "Chats › Conversación" (no aportaba) y
// ConvHeader, debajo, el título con su "···"; en móvil eran 52 px de chat
// menos. Ahora el título ES el disparador del menú del chat (como Claude):
// Fijar, Renombrar, Mover a carpeta, Exportar, Archivar, Eliminar.
//
// Renombrar edita en línea aquí mismo, con la misma lógica que tenía
// ConvHeader: se queda en edición (campo bloqueado + spinner) hasta que el
// PATCH vuelve, porque contra el VPS esa espera se sentía como que no había
// pasado nada.
export function ChatCrumb({ chatId }: { chatId: string }) {
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);
  const chatsError = useChatsStore((s) => s.error);
  const rename = useChatsStore((s) => s.rename);
  const folders = useFoldersStore((s) => s.folders);
  const refreshFolders = useFoldersStore((s) => s.refresh);
  useEffect(() => {
    if (!chats) void refreshChats();
  }, [chats, refreshChats]);
  useEffect(() => {
    if (!folders) void refreshFolders();
  }, [folders, refreshFolders]);

  const chat = chats?.find((c) => c.id === chatId);
  // `chats` solo trae los no archivados: uno archivado (o la lista aún sin
  // cargar) no tiene título aquí.
  const title = chat?.title ?? "Conversación";
  const folder = chat?.folderId ? folders?.find((f) => f.id === chat.folderId) : undefined;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(title);
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await rename(chatId, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // El esqueleto solo mientras carga: si la lista falló, se sigue con
  // "Conversación" y su menú (renombrar, archivar…) en vez de quedarse
  // cargando para siempre.
  if (chats === null && !chatsError) {
    // flex-1 como el <nav>: la Topbar no pinta su separador en un chat, y
    // sin esto los botones de la derecha brincaban al llegar la lista.
    return (
      <div className="flex-1">
        <span className="skeleton block h-4 w-40 rounded-md" aria-label="Cargando el chat" />
      </div>
    );
  }

  return (
    <nav aria-label="Conversación" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
      {folder && (
        <>
          <span className="hidden max-w-40 shrink-0 items-center gap-1 truncate text-fg-muted sm:flex">
            {folder.icon && <span aria-hidden>{folder.icon}</span>}
            <span className="truncate">{folder.name}</span>
          </span>
          <span className="hidden text-fg-muted sm:inline" aria-hidden>
            /
          </span>
        </>
      )}
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            autoFocus
            aria-label="Nombre del chat"
            // Selecciona todo al entrar: renombrar casi siempre es
            // reemplazar el título autogenerado.
            onFocus={(e) => e.currentTarget.select()}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 min-w-0 flex-1 rounded-md bg-app px-2 text-sm font-semibold text-fg focus-visible:ring-2 focus-visible:ring-line-focus disabled:opacity-60 sm:max-w-md"
          />
          {saving ? (
            <span className="flex size-7 shrink-0 items-center justify-center text-fg-muted">
              <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-label="Guardando" />
            </span>
          ) : (
            <>
              <button
                type="button"
                aria-label="Guardar"
                onClick={() => void commit()}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-success hover:bg-secondary-hover"
              >
                <Check size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => setEditing(false)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-secondary-hover"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-w-0">
          <ChatOptionsMenu
            chatId={chatId}
            folderId={chat?.folderId ?? null}
            onRenameRequest={startEdit}
            placement="bottom-start"
            triggerLabel={`Opciones del chat ${title}`}
            triggerClassName="-ml-1.5 flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-fg transition-colors hover:bg-secondary-hover aria-expanded:bg-secondary-hover"
            trigger={
              <>
                <span className="truncate">{title}</span>
                <ChevronDown size={14} strokeWidth={2} className="shrink-0 text-fg-muted" />
              </>
            }
          />
        </div>
      )}
    </nav>
  );
}
