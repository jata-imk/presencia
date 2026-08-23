import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ChatOptionsMenu } from "./ChatOptionsMenu.js";

// Header de la conversación (Chat Conversation.html, ConvHeader). El menú
// "···" (Renombrar/Mover a carpeta/Exportar/Archivar/Eliminar) vive en
// ChatOptionsMenu, compartido con cada fila de "Recientes" en el Sidebar
// (F6 PR8 follow-up). Acá solo queda la edición inline del título — la
// única acción que este layout maneja distinto a una fila angosta.
//
// Chips de canal (web/whatsapp/telegram) del mockup tampoco se pintan: un
// chat no tiene un canal de origen fijo en nuestro modelo de datos hoy.
export function ConvHeader({
  chatId,
  title,
  folderId,
  onRename,
}: {
  chatId: string;
  title: string;
  folderId: string | null;
  onRename: (title: string) => Promise<void>;
}) {
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
    // Se queda en modo edición (campo bloqueado + spinner) hasta que el
    // PATCH vuelve, en vez de saltar a modo lectura con el título viejo de
    // una — en el entorno real (API detrás del túnel, no localhost) esa
    // espera se sentía como que el rename no había hecho nada.
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-card px-5">
      <Link
        to="/chats"
        aria-label="Volver a tus chats"
        className="shrink-0 text-fg-muted transition-colors hover:text-fg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            autoFocus
            // Selecciona todo al entrar (mismo criterio que ChatListItem):
            // renombrar casi siempre es reemplazar el título autogenerado.
            onFocus={(e) => e.currentTarget.select()}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-md bg-app px-2 py-1 text-sm font-semibold text-fg focus-visible:ring-2 focus-visible:ring-line-focus disabled:opacity-60"
          />
          {saving ? (
            <div className="flex size-7 shrink-0 items-center justify-center text-fg-muted">
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-label="Guardar"
                onClick={() => void commit()}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-success"
              >
                <Check size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => setEditing(false)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="truncate text-sm font-semibold text-fg">{title}</span>
          <Pencil
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      )}

      <ChatOptionsMenu chatId={chatId} folderId={folderId} onRenameRequest={startEdit} />
    </div>
  );
}
