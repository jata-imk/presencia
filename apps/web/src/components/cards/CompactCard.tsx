import { AlignLeft, Calendar, Film, Loader2, PanelRight } from "lucide-react";
import { useState } from "react";
import {
  assetContentUrl,
  buildPostText,
  socialNetworkSchema,
  type SocialNetwork,
} from "@presencia/shared";
import { formatScheduleDateTime } from "../../lib/calendar/tz.js";
import { useTimezone } from "../../lib/calendar/use-timezone.js";
import { useCardController } from "../../lib/cards/use-card-controller.js";
import type { CardToolPart } from "../../lib/chat-types.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { Badge, badgeKindFor } from "./Badge.js";
import { NETWORK_META } from "./NetworkLogos.js";

// La card del chat en F10.5 (Chat Rediseño.html → CompactCard): una fila con
// miniatura, red, estado y la primera línea del texto. La publicación
// completa —vista previa fiel, edición, imagen— vive en el panel; esta fila
// solo la identifica y la abre. Así un turno con tres redes ya no llena la
// pantalla.
//
// El glow animado de borrador NO va aquí: lo pone quien la contiene (la card
// suelta o el contenedor del grupo), ver AssistantMessage.

export function CompactCard({
  part,
  open,
  onOpen,
  mobile,
  selection,
}: {
  part: CardToolPart;
  /** Es la pestaña activa del panel. */
  open: boolean;
  onOpen: () => void;
  mobile: boolean;
  /**
   * F10.5 PR5, selección multired: el checkbox aparece en hover (escritorio)
   * o siempre que ya haya algo seleccionado en el chat.
   */
  selection?: { selected: boolean; active: boolean; onToggle: () => void };
}) {
  const cardId = part.state === "output-available" ? part.output.cardId : undefined;
  const { card, openSchedule, imageJob } = useCardController(cardId, { withMedia: false });
  const timeZone = useTimezone();

  if (part.state === "input-streaming" || part.state === "input-available") {
    return <BornCard network={networkOfInput(part.input)} />;
  }
  if (part.state === "output-error") {
    return (
      <div className="px-3 py-2.5 text-[12.5px] text-error">
        No se pudo crear el borrador: {part.errorText}
      </div>
    );
  }
  if (part.state !== "output-available") return null;

  // El contenido vivo manda; el del tool part es el de nacimiento, congelado
  // en messages.parts, y solo sirve el instante antes de que llegue la card.
  const content = card?.content ?? part.output.content;
  const network = part.output.network;
  // Mensajes persistidos antes de que la tool devolviera `content` (previo
  // a F3 PR3) traen output sin ese campo.
  if (!content) {
    return (
      <div className="px-3 py-2.5 text-[12.5px] text-fg-muted">
        Borrador creado con una versión anterior de Presencia.
      </div>
    );
  }

  const status = card?.status ?? "draft";
  const { Logo, label } = NETWORK_META[network];
  const firstLine =
    buildPostText(content)
      .split("\n")
      .find((l) => l.trim()) ?? "";
  const when =
    status === "scheduled" && card?.scheduledAt
      ? formatScheduleDateTime(card.scheduledAt, timeZone)
      : null;

  // Lo publicado ya no se programa junto con nada.
  const selectable = selection && status !== "published" && status !== "canceled";

  return (
    <div
      className={`group/card flex items-center gap-2.5 px-3 py-2.5 transition-colors ${
        open ? "bg-tint-plum" : selection?.selected ? "bg-surface" : "hover:bg-surface"
      }`}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selection.selected}
          onChange={selection.onToggle}
          aria-label={`Seleccionar borrador de ${label}`}
          // En móvil no hay hover: el checkbox se ve siempre, o una card
          // suelta (sin el "Seleccionar" de un grupo) no tendría cómo entrar
          // a la selección.
          className={`size-4 shrink-0 cursor-pointer accent-primary transition-opacity ${
            selection.active || selection.selected || mobile
              ? "opacity-100"
              : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
          }`}
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir borrador de ${label}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <Thumb
          kind={content.archetype}
          assetId={content.assetIds[0]}
          slides={content.archetype !== "video_script" ? (content.slides?.length ?? 0) : 0}
          generating={imageJob?.status === "generating"}
          size={mobile ? 40 : 44}
        />
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <Logo size={14} />
            <span className="font-display text-[13px] font-semibold text-fg">{label}</span>
            <Badge kind={badgeKindFor(content.archetype, status)} small />
            {when && <span className="text-[11px] text-fg-muted">{when}</span>}
          </span>
          <span
            className={`block overflow-hidden text-[12.5px] leading-[1.45] text-fg-secondary ${
              mobile ? "line-clamp-2" : "truncate"
            }`}
          >
            {firstLine}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        {open && !mobile ? (
          <span className="inline-flex items-center gap-1 px-2 font-display text-[11px] font-semibold text-accent">
            <PanelRight size={13} aria-hidden="true" />
            Abierto
          </span>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-7 items-center rounded-lg bg-tint-plum px-2.5 font-display text-xs font-semibold whitespace-nowrap text-accent hover:bg-ai-bg"
          >
            {mobile ? "Ver vista previa" : "Abrir"}
          </button>
        )}
        {status === "draft" && card && !mobile && (
          <button
            type="button"
            onClick={openSchedule}
            aria-label={`Programar borrador de ${label}`}
            title="Programar"
            className="inline-flex size-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg"
          >
            <Calendar size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function networkOfInput(input: unknown): SocialNetwork | null {
  const parsed = socialNetworkSchema.safeParse(
    (input as { network?: unknown } | undefined)?.network,
  );
  return parsed.success ? parsed.data : null;
}

function Thumb({
  kind,
  assetId,
  slides,
  generating,
  size,
}: {
  kind: "visual_first" | "text_first" | "video_script";
  assetId: string | undefined;
  /** F10.6: cuántos slides tiene si es carrusel (0 si no): la portada dice "1/5". */
  slides: number;
  generating: boolean;
  size: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg";
  if (generating) {
    return (
      <span
        style={{ width: size, height: size }}
        className={`${box} border border-ai-border bg-ai-bg`}
      >
        <Loader2 size={16} className="animate-spin text-accent" aria-label="Generando imagen" />
      </span>
    );
  }
  if (assetId && failed !== assetId) {
    return (
      <span style={{ width: size, height: size }} className={`${box} relative`}>
        <img
          src={assetContentUrl(assetId)}
          alt=""
          loading="lazy"
          onError={() => setFailed(assetId)}
          className="size-full object-cover"
        />
        {slides > 1 && (
          <span
            aria-label={`Carrusel de ${String(slides)} imágenes`}
            className="absolute right-0.5 bottom-0.5 rounded-sm bg-fg/70 px-1 text-[9px] leading-tight font-bold text-fg-inverse"
          >
            1/{slides}
          </span>
        )}
      </span>
    );
  }
  const Icon = kind === "video_script" ? Film : AlignLeft;
  return (
    <span
      style={{ width: size, height: size }}
      className={`${box} border border-line bg-surface text-fg-muted`}
    >
      <Icon size={Math.round(size * 0.42)} aria-hidden="true" />
    </span>
  );
}

/** El borrador que se está escribiendo: su lugar en la fila, antes de que exista. */
export function BornCard({ network }: { network: SocialNetwork | null }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5" role="status">
      <span className="skeleton size-11 shrink-0 rounded-lg" />
      <span className="flex-1">
        <span className="mb-1.5 block font-display text-[12.5px] font-semibold text-fg-secondary">
          Creando borrador{network ? ` para ${NETWORK_LABELS[network]}` : ""}…
        </span>
        <span className="skeleton block h-2 w-[70%] rounded" />
      </span>
    </div>
  );
}
