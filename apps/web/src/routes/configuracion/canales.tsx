import { ExternalLink, Plug } from "lucide-react";
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
import { Button } from "../../components/ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useChannels } from "../../lib/use-channels.js";

// Configuración > Canales conectados (F6, ADR-009 addendum). El workspace de
// PostFast es compartido entre todos los usuarios de Presencia — "conectar"
// abre postfa.st en una pestaña nueva y, al volver, el usuario confirma acá
// para que el backend reclame la(s) cuenta(s) nueva(s) por diff (ver
// ChannelsService.claimConnectIntent). No hay webhook que nos avise solo.

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

type ConnectStep = { intentId: string; connectUrl: string } | null;

export function CanalesPage() {
  const { channels, error, refresh, createConnectIntent, claimConnectIntent, disconnect } =
    useChannels();
  const [connectStep, setConnectStep] = useState<ConnectStep>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleStartConnect() {
    setClaimMessage(null);
    try {
      const intent = await createConnectIntent();
      window.open(intent.connectUrl, "_blank", "noopener,noreferrer");
      setConnectStep({ intentId: intent.id, connectUrl: intent.connectUrl });
    } catch {
      setClaimMessage("No pudimos iniciar la conexión. Inténtalo de nuevo.");
    }
  }

  async function handleClaim() {
    if (!connectStep) return;
    setBusy(true);
    try {
      const claimed = await claimConnectIntent(connectStep.intentId);
      if (claimed.length === 0) {
        setClaimMessage(
          "No detectamos ninguna cuenta nueva todavía. Termina de conectar tu red en la otra pestaña y vuelve a intentar.",
        );
      } else {
        setClaimMessage(null);
        setConnectStep(null);
        refresh();
      }
    } catch (err) {
      setClaimMessage(
        err instanceof ApiError ? err.message : "Algo salió mal confirmando la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect(id: string) {
    setBusy(true);
    try {
      await disconnect(id);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (channels === null && !error) return <SkeletonDePagina />;

  return (
    <div>
      <EncabezadoDePagina
        titulo="Canales conectados"
        subtitulo="Las redes a las que Presencia puede publicar por ti."
      />

      {connectStep && (
        <NotaInfo>
          Se abrió una pestaña nueva para conectar tu red. Cuando termines ahí, vuelve y confirma
          acá.
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void handleClaim()} disabled={busy}>
              Ya conecté mi cuenta
            </Button>
            <Button variant="secondary" onClick={() => setConnectStep(null)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </NotaInfo>
      )}

      <Seccion icono={Plug} titulo="Tus redes">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            onClick={() => void handleStartConnect()}
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
