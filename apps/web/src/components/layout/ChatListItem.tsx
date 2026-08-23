import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { ChatSummary } from "@presencia/shared";
import { ChatOptionsMenu } from "../chat/ChatOptionsMenu.js";
import { useChatsStore } from "../../stores/chats-store.js";

// Fila de "Recientes" en el Sidebar — antes un <Link> plano, ahora un
// componente propio con las mismas opciones que ConvHeader (F6 PR8
// follow-up: Jose pidió que el menú "···" no viviera solo dentro de la
// conversación abierta). El "···" aparece al hacer hover de la fila
// (mismo patrón que Slack/Linear), no siempre visible — a 200px de ancho
// no hay lugar para dos íconos permanentes por fila.
export function ChatListItem({ chat, active }: { chat: ChatSummary; active: boolean }) {
  const renameChat = useChatsStore((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(chat.title);
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === chat.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await renameChat(chat.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-md px-1.5 py-1">
        <input
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded-md bg-card px-1.5 py-0.5 text-[13px] text-fg focus-visible:ring-2 focus-visible:ring-line-focus disabled:opacity-60"
        />
        {saving ? (
          <Loader2 size={12} strokeWidth={2} className="shrink-0 animate-spin text-fg-muted" />
        ) : (
          <>
            <button
              type="button"
              aria-label="Guardar"
              onClick={() => void commit()}
              className="shrink-0 text-success"
            >
              <Check size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              onClick={() => setEditing(false)}
              className="shrink-0 text-fg-muted"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center rounded-md pr-1 transition-colors has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-line-focus ${
        active ? "bg-tint-plum text-brand" : "text-fg-secondary hover:bg-secondary-hover"
      }`}
    >
      {/* Handoff de un solo anillo a la vez, no dos encimados: Tab 1 (el
          título) → anillo de FILA completa (has-[a:focus-visible] arriba,
          en vez de focus-within — este último dispara con CUALQUIER
          descendiente, incluido el "···", que es justo lo que no
          queríamos). Tab 2 (el "···") → focus-within ya no aplica al `a`,
          el anillo de fila desaparece y el botón muestra el suyo propio
          (global, app.css) sin que nadie lo esté suprimiendo acá.
          focus-visible:shadow-none en el Link apaga su anillo individual
          MIENTRAS el de fila ya lo cubre (Tab 1) — evita doble anillo ahí.
          truncate va en el <span> interno, no en el Link: un <a> con
          overflow-hidden propio recorta su propio anillo de foco en forma
          de "L" (bug real visto antes de este cambio). */}
      <Link
        to={`/chats/${chat.id}`}
        className="min-w-0 flex-1 px-2.5 py-1.5 text-[13px] focus-visible:shadow-none"
      >
        <span className="block truncate">{chat.title}</span>
      </Link>
      <div className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <ChatOptionsMenu chatId={chat.id} folderId={chat.folderId} onRenameRequest={startEdit} />
      </div>
    </div>
  );
}
