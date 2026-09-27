import { ArrowLeft, PlugZap, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { NETWORK_META } from "../../components/cards/NetworkLogos.js";
import { ModalDeleteChannel } from "../../components/channels/ModalDeleteChannel.js";
import {
  EncabezadoDePagina,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { ApiError } from "../../lib/api.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useChannels } from "../../lib/use-channels.js";

// F6 follow-up — mismo patrón que ArchivedChatsPage (archived-chats.tsx):
// vista aparte para lo que ya no vive en la lista principal, con su propia
// acción de recuperación ("Reconectar", ya existía) y una nueva de
// borrado permanente (con modal de confirmación, Jose la pidió explícita:
// "que en desconectadas sí haya la posibilidad de borrarlas de verdad").
export function CanalesDesconectadasPage() {
  const {
    disconnectedChannels,
    refreshDisconnected,
    reactivate,
    disconnectedError: loadError,
  } = useChannels();
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

  // Un fallo al cargar tiene que decirse: sin esto el skeleton se quedaba
  // para siempre, sin mensaje ni forma de reintentar.
  if (disconnectedChannels === null) {
    if (!loadError) return <SkeletonDePagina />;
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-error-fg">{loadError}</p>
        <button
          type="button"
          onClick={refreshDisconnected}
          className="text-xs text-fg-secondary underline underline-offset-2 hover:text-fg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/configuracion/canales"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-secondary hover:text-fg"
      >
        <ArrowLeft size={13} aria-hidden />
        Canales conectados
      </Link>
      <EncabezadoDePagina
        titulo="Cuentas desconectadas"
        subtitulo="Recupéralas cuando quieras, o bórralas para siempre."
      />

      <Seccion
        icono={PlugZap}
        titulo={`${String(disconnectedChannels.length)} cuenta${disconnectedChannels.length === 1 ? "" : "s"}`}
      >
        {error && <p className="text-sm text-error-fg">{error}</p>}

        {disconnectedChannels.length === 0 && (
          <p className="text-sm text-fg-muted">No tienes cuentas desconectadas.</p>
        )}

        {disconnectedChannels.length > 0 && (
          <ul className="flex flex-col gap-2">
            {disconnectedChannels.map((channel) => {
              const red = NETWORK_META[channel.network];
              return (
                <li
                  key={channel.id}
                  className="flex items-center gap-3 rounded-md border border-line bg-surface p-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card opacity-70">
                    <red.Logo size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-fg">{red.label}</p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {channel.displayName ?? "Sin nombre"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReactivate(channel.id)}
                    disabled={busyId === channel.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border-[1.5px] border-line bg-card px-3 py-1.75 font-display text-[12.5px] font-semibold text-fg-secondary transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    {busyId === channel.id ? "Reconectando…" : "Reconectar"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar ${NETWORK_LABELS[channel.network]} para siempre`}
                    onClick={() => setDeletingId(channel.id)}
                    className="flex shrink-0 items-center justify-center rounded-md border border-error-border p-2 text-error-fg transition-colors hover:bg-error-bg"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

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
