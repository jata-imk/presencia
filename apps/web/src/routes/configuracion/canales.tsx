import { ExternalLink, MessageCircle, Plug } from "lucide-react";
import { useState } from "react";
import type { ChannelAccountDto } from "@presencia/shared";
import { Link } from "react-router";
import { NETWORK_META } from "../../components/cards/NetworkLogos.js";
import {
  Aviso,
  EncabezadoDePagina,
  NotaInfo,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { ModalDisconnectTelegram } from "../../components/configuracion/ModalDisconnectTelegram.js";
import { TelegramCard } from "../../components/configuracion/TelegramCard.js";
import { Button } from "../../components/ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useChannels } from "../../lib/use-channels.js";
import { useConectarRed } from "../../lib/use-conectar-red.js";
import { useTelegramLink } from "../../lib/use-telegram-link.js";
import { useTelegramLinkStore } from "../../stores/telegram-link-store.js";

// Configuración > Canales conectados (F6, ADR-009 addendum). El workspace de
// PostFast es compartido entre todos los usuarios de Presencia — "conectar"
// abre postfa.st en una pestaña nueva y, al volver, el usuario confirma acá
// para que el backend reclame la(s) cuenta(s) nueva(s) por diff (ver
// ChannelsService.claimConnectIntent). No hay webhook que nos avise solo.
//
// F11 PR7a: la página tiene dos partes (Claude Design "Chat Telegram" §1):
// "Chatear desde" (Telegram, para hablar con Presencia) arriba de "Redes para
// publicar" (PostFast). Son cosas distintas y no se mezclan.

const STATUS_LABELS: Record<ChannelAccountDto["status"], string> = {
  active: "Conectada",
  disconnected: "Desconectada",
  error: "Con error",
};

const STATUS_CLASSES: Record<ChannelAccountDto["status"], string> = {
  active: "bg-success-bg text-success-fg",
  disconnected: "bg-secondary text-fg-muted",
  error: "bg-error-bg text-error-fg",
};

export function CanalesPage() {
  const canales = useChannels();
  const { channels, error, refresh, disconnect } = canales;
  // El baile de conectar vive en un hook compartido con el onboarding (F12.5).
  const conexion = useConectarRed(canales);
  const connectStep = conexion.enCurso;
  const claimMessage = conexion.mensaje;
  const [desconectando, setDesconectando] = useState(false);
  const busy = conexion.ocupado || desconectando;

  async function handleClaim() {
    const reclamadas = await conexion.confirmar();
    if (reclamadas.length > 0) refresh();
  }

  async function handleDisconnect(id: string) {
    setDesconectando(true);
    try {
      await disconnect(id);
      refresh();
    } finally {
      setDesconectando(false);
    }
  }

  const telegram = useTelegramLink();
  const telegramLoading = telegram.view === null && !telegram.loadError;
  if ((channels === null && !error) || telegramLoading) return <SkeletonDePagina />;

  return (
    <div>
      <EncabezadoDePagina
        titulo="Canales conectados"
        subtitulo="Desde dónde hablas con Presencia y en dónde publica por ti."
      />

      <ChatearDesde view={telegram.view} loadError={telegram.loadError} />

      {connectStep && (
        <NotaInfo>
          Se abrió una pestaña nueva para conectar tu red. Cuando termines ahí, vuelve y confirma
          acá.
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void handleClaim()} disabled={busy}>
              Ya conecté mi cuenta
            </Button>
            <Button variant="secondary" onClick={conexion.cancelar} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </NotaInfo>
      )}

      <Seccion
        icono={Plug}
        titulo="Redes para publicar"
        subtitulo="Presencia programa y publica en estas cuentas."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            onClick={() => void conexion.iniciar()}
            disabled={busy || connectStep !== null}
            className="inline-flex items-center gap-1.5"
          >
            <ExternalLink size={14} strokeWidth={1.8} aria-hidden />
            Conectar red
          </Button>
          {/* Las desconectadas viven en su propia vista (F6 follow-up, Jose:
              "no me gusta que las que desconecto se queden mezcladas") —
              mismo patrón que Archivados en Chats. Reconectar/eliminar de
              verdad pasa por ahí, no por acá. */}
          <Link
            to="/configuracion/canales/desconectadas"
            className="text-xs text-fg-secondary underline underline-offset-2 hover:text-fg"
          >
            Ver cuentas desconectadas
          </Link>
        </div>

        {claimMessage && <Aviso>{claimMessage}</Aviso>}
        {error && <p className="text-sm text-error-fg">{error}</p>}

        {channels?.length === 0 && (
          <p className="rounded-md border border-dashed border-line-focus bg-surface p-4 text-sm text-fg-secondary">
            Todavía no conectas ninguna red social. Conecta una para poder programar publicaciones
            directo desde el chat.
          </p>
        )}

        {channels && channels.length > 0 && (
          <ul className="flex flex-col gap-2">
            {channels.map((channel) => {
              const red = NETWORK_META[channel.network];
              return (
                <li
                  key={channel.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card">
                    <red.Logo size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-fg">{red.label}</p>
                    <p className="truncate text-xs text-fg-secondary">
                      {channel.displayName ?? "Sin nombre"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[channel.status]}`}
                  >
                    {STATUS_LABELS[channel.status]}
                  </span>
                  {channel.status === "active" && (
                    <Button
                      variant="secondary"
                      onClick={() => void handleDisconnect(channel.id)}
                      disabled={busy}
                      // En móvil baja a su propia línea: a la derecha, bajo el chip.
                      className="ml-auto"
                    >
                      Desconectar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

/** Telegram (F11 PR7a). Sin bot en el servidor, la sección no se pinta. */
function ChatearDesde({
  view,
  loadError,
}: Pick<ReturnType<typeof useTelegramLink>, "view" | "loadError">) {
  const createLink = useTelegramLinkStore((s) => s.createLink);
  const unlink = useTelegramLinkStore((s) => s.unlink);
  const username = useTelegramLinkStore((s) => s.status?.username ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (view?.kind === "hidden") return null;

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      await createLink();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No pudimos generar el enlace. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Seccion
      icono={MessageCircle}
      titulo="Chatear desde"
      subtitulo="Habla con Presencia fuera de la web."
    >
      {view ? (
        <TelegramCard
          view={view}
          busy={busy}
          error={error}
          onConnect={() => void handleConnect()}
          onDisconnect={() => setConfirming(true)}
        />
      ) : (
        <p className="text-sm text-error-fg">{loadError}</p>
      )}
      {confirming && (
        <ModalDisconnectTelegram
          username={username}
          onClose={() => setConfirming(false)}
          onConfirm={unlink}
          onDisconnected={() => setConfirming(false)}
        />
      )}
    </Seccion>
  );
}
