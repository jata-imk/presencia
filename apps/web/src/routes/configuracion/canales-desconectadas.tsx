import { PlugZap, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ModalDeleteChannel } from "../../components/channels/ModalDeleteChannel.js";
import { ApiError } from "../../lib/api.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useChannels } from "../../lib/use-channels.js";

// F6 follow-up — mismo patrón que ArchivedChatsPage (archived-chats.tsx):
// vista aparte para lo que ya no vive en la lista principal, con su propia
// acción de recuperación ("Reconectar", ya existía) y una nueva de
// borrado permanente (con modal de confirmación, Jose la pidió explícita:
// "que en desconectadas sí haya la posibilidad de borrarlas de verdad").
export function CanalesDesconectadasPage() {
  const { disconnectedChannels, refreshDisconnected, reactivate } = useChannels();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    refreshDisconnected();
  }, [refreshDisconnected]);

  async function handleReactivate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await reactivate(id);
      refreshDisconnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo reconectar esa cuenta.");
    } finally {
      setBusyId(null);
    }
  }

  const deletingAccount = disconnectedChannels?.find((c) => c.id === deletingId);

  return (
    <div className="mx-auto max-w-[780px] px-6 py-6">
      <div className="mb-4 flex items-center gap-2.5">
        <PlugZap size={16} strokeWidth={1.75} className="text-fg-secondary" />
        <h1 className="text-base font-bold text-fg">Cuentas desconectadas</h1>
        {disconnectedChannels && (
          <span className="text-xs text-fg-muted">
            {disconnectedChannels.length} cuenta{disconnectedChannels.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Link
        to="/configuracion/canales"
        className="mb-4 inline-block text-xs text-fg-muted underline"
      >
        Volver a canales conectados
      </Link>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {disconnectedChannels === null && <p className="text-sm text-fg-muted">Cargando…</p>}
      {disconnectedChannels?.length === 0 && (
        <p className="text-sm text-fg-muted">No tienes cuentas desconectadas.</p>
      )}

      {disconnectedChannels && disconnectedChannels.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {disconnectedChannels.map((channel, i) => (
            <div
              key={channel.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < disconnectedChannels.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{NETWORK_LABELS[channel.network]}</p>
                <p className="mt-0.5 truncate text-xs text-fg-muted">
                  {channel.displayName ?? "Sin nombre"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleReactivate(channel.id)}
                disabled={busyId === channel.id}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-secondary-hover disabled:opacity-50"
              >
                {busyId === channel.id ? "Reconectando…" : "Reconectar"}
              </button>
              <button
                type="button"
                aria-label={`Eliminar ${NETWORK_LABELS[channel.network]} para siempre`}
                onClick={() => setDeletingId(channel.id)}
                className="flex shrink-0 items-center justify-center rounded-md border border-error-border p-1.5 text-error transition-colors hover:bg-error-bg"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}

      {deletingAccount && (
        <ModalDeleteChannel
          accountId={deletingAccount.id}
          networkLabel={NETWORK_LABELS[deletingAccount.network]}
          onClose={() => setDeletingId(null)}
          onDeleted={() => {
            setDeletingId(null);
            refreshDisconnected();
          }}
        />
      )}
    </div>
  );
}
