import { useState } from "react";
import type { ChannelAccountDto, SocialNetwork } from "@presencia/shared";
import { Button } from "../../components/ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useChannels } from "../../lib/use-channels.js";

// Configuración > Canales conectados (F6, ADR-009 addendum). El workspace de
// PostFast es compartido entre todos los usuarios de Presencia — "conectar"
// abre postfa.st en una pestaña nueva y, al volver, el usuario confirma acá
// para que el backend reclame la(s) cuenta(s) nueva(s) por diff (ver
// ChannelsService.claimConnectIntent). No hay webhook que nos avise solo.

const NETWORK_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
  x: "X",
};

const STATUS_LABELS: Record<ChannelAccountDto["status"], string> = {
  active: "Conectada",
  disconnected: "Desconectada",
  error: "Con error",
};

const STATUS_CLASSES: Record<ChannelAccountDto["status"], string> = {
  active: "bg-success-bg text-success",
  disconnected: "bg-secondary text-fg-muted",
  error: "bg-error-bg text-error",
};

type ConnectStep = { intentId: string; connectUrl: string } | null;

export function CanalesPage() {
  const {
    channels,
    error,
    refresh,
    createConnectIntent,
    claimConnectIntent,
    disconnect,
    reactivate,
  } = useChannels();
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

  async function handleReactivate(id: string) {
    setBusy(true);
    try {
      await reactivate(id);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-fg">Canales conectados</h1>
        <Button onClick={() => void handleStartConnect()} disabled={busy || connectStep !== null}>
          Conectar red
        </Button>
      </div>

      {connectStep && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-tint-plum p-4">
          <p className="text-sm text-fg-secondary">
            Se abrió una pestaña nueva para conectar tu red. Cuando termines ahí, vuelve y confirma
            acá.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void handleClaim()} disabled={busy}>
              Ya conecté mi cuenta
            </Button>
            <Button variant="secondary" onClick={() => setConnectStep(null)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {claimMessage && <p className="text-sm text-warning">{claimMessage}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {channels === null && !error && <p className="text-sm text-fg-muted">Cargando…</p>}

      {channels?.length === 0 && (
        <p className="rounded-md border border-line bg-surface p-4 text-sm text-fg-muted">
          Todavía no conectas ninguna red social. Conecta una para poder programar publicaciones
          directo desde el chat.
        </p>
      )}

      {channels && channels.length > 0 && (
        <ul className="flex flex-col gap-2">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex items-center gap-3 rounded-md border border-line bg-surface p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-fg">{NETWORK_LABELS[channel.network]}</p>
                <p className="text-xs text-fg-secondary">{channel.displayName ?? "Sin nombre"}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[channel.status]}`}
              >
                {STATUS_LABELS[channel.status]}
              </span>
              {channel.status === "active" && (
                <Button
                  variant="secondary"
                  onClick={() => void handleDisconnect(channel.id)}
                  disabled={busy}
                >
                  Desconectar
                </Button>
              )}
              {channel.status === "disconnected" && (
                <Button
                  variant="secondary"
                  onClick={() => void handleReactivate(channel.id)}
                  disabled={busy}
                >
                  Reconectar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
