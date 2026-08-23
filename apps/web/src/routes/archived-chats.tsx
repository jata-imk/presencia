import { Archive, ArchiveRestore, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../lib/api.js";
import { useChatsStore } from "../stores/chats-store.js";

// Portado de ArchivedView (Chat Part 3.html) — pantalla aparte, no un
// filtro dentro de "Recientes" (mismo criterio del mockup).
export function ArchivedChatsPage() {
  const archivedChats = useChatsStore((s) => s.archivedChats);
  const refreshArchived = useChatsStore((s) => s.refreshArchived);
  const unarchive = useChatsStore((s) => s.unarchive);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshArchived();
  }, [refreshArchived]);

  async function handleUnarchive(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await unarchive(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo desarchivar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[780px] px-6 py-6">
      <div className="mb-4 flex items-center gap-2.5">
        <Archive size={16} strokeWidth={1.75} className="text-fg-secondary" />
        <h1 className="text-base font-bold text-fg">Archivados</h1>
        {archivedChats && (
          <span className="text-xs text-fg-muted">
            {archivedChats.length} conversaci{archivedChats.length === 1 ? "ón" : "ones"}
          </span>
        )}
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-line-focus bg-tint-plum p-3">
        <Info size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-xs text-fg-secondary">
          Las conversaciones archivadas no aparecen en Recientes pero conservan sus publicaciones
          programadas.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {archivedChats === null && <p className="text-sm text-fg-muted">Cargando…</p>}
      {archivedChats?.length === 0 && (
        <p className="text-sm text-fg-muted">No tienes conversaciones archivadas.</p>
      )}

      {archivedChats && archivedChats.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {archivedChats.map((chat, i) => (
            <div
              key={chat.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < archivedChats.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                {/* truncate en el span interno, no en el Link — ver el
                    mismo fix en ChatListItem.tsx (bug de anillo de foco
                    recortado en "L" por el overflow-hidden del propio
                    <a>). */}
                <Link
                  to={`/chats/${chat.id}`}
                  className="block text-sm font-medium text-fg hover:underline"
                >
                  <span className="block truncate">{chat.title}</span>
                </Link>
                <p className="mt-0.5 text-xs text-fg-muted">
                  archivado el {new Date(chat.archivedAt!).toLocaleDateString("es-MX")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleUnarchive(chat.id)}
                disabled={busyId === chat.id}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-secondary-hover disabled:opacity-50"
              >
                <ArchiveRestore size={12} strokeWidth={1.75} />
                {busyId === chat.id ? "Desarchivando…" : "Desarchivar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
