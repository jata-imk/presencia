import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

// Header de la conversación (Chat Conversation.html, ConvHeader) —
// simplificado a lo que existe de verdad: el título es editable (el rename
// ya existe, PATCH /api/chats/:id) mediante click-para-editar en vez del
// menú "···" del mockup (Renombrar/Mover a carpeta/Exportar/Archivar/
// Eliminar) — de esas cinco acciones solo Renombrar tiene backend; un menú
// con un ítem real y cuatro decorativos es peor que no tener menú.
// Chips de canal (web/whatsapp/telegram) del mockup tampoco se pintan: un
// chat no tiene un canal de origen fijo en nuestro modelo de datos hoy.
export function ConvHeader({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function startEdit() {
    setDraft(title);
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) return;
    await onRename(trimmed);
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-md border border-line-focus bg-app px-2 py-1 text-sm font-semibold text-fg outline-none"
          />
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
    </div>
  );
}
