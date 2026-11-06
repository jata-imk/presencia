import type { ExternalChannel } from "@presencia/shared";
import { MessageCircle, Send, type LucideIcon } from "lucide-react";
import { Tooltip } from "../ui/Tooltip.js";

// Por qué canales pasó un chat, en su fila de Recientes (F11 PR7b, Claude
// Design "Chat Telegram" §2.1). Un chat solo de la web no lleva nada: la web
// es el canal por defecto, y marcarla en cada fila sería ruido. Monocromos y
// chicos, en el color de la fila: el azul de Telegram se queda en
// Configuración.

/** Íconos genéricos, no logos (misma regla que NetworkLogos.tsx). */
const CHANNELS: Record<ExternalChannel, { Icon: LucideIcon; label: string }> = {
  telegram: { Icon: Send, label: "Telegram" },
  whatsapp: { Icon: MessageCircle, label: "WhatsApp" },
};

/** Cuántos íconos caben antes del "+N". */
const MAX_VISIBLE = 2;

/** Los que se pintan y cuántos quedan en el "+N". Puro, para probarlo. */
export function visibleChannels(channels: readonly ExternalChannel[]): {
  shown: ExternalChannel[];
  more: number;
} {
  return {
    shown: channels.slice(0, MAX_VISIBLE),
    more: Math.max(0, channels.length - MAX_VISIBLE),
  };
}

/** "Usado desde Telegram" / "Usado desde Telegram y WhatsApp". */
export function channelsLabel(channels: readonly ExternalChannel[]): string {
  const names = channels.map((c) => CHANNELS[c].label);
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)!}` : names.join("");
  return `Usado desde ${list}`;
}

export function ChannelIcons({
  channels,
  active = false,
}: {
  channels: readonly ExternalChannel[];
  /** La fila del chat abierto: el ícono sube de tono con ella. */
  active?: boolean;
}) {
  if (channels.length === 0) return null;
  const { shown, more } = visibleChannels(channels);
  const label = channelsLabel(channels);
  return (
    <Tooltip label={label}>
      <span
        role="img"
        aria-label={label}
        className={`inline-flex shrink-0 items-center gap-1 ${active ? "text-fg-secondary" : "text-fg-muted"}`}
      >
        {shown.map((c) => {
          const { Icon } = CHANNELS[c];
          return <Icon key={c} size={12} strokeWidth={1.75} aria-hidden />;
        })}
        {more > 0 && (
          <span className="font-display text-[10.5px] font-semibold" aria-hidden>
            +{more}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
