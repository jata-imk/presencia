import { useState } from "react";
import type { CardStatus, PublicationCardDto } from "@presencia/shared";
import { ScheduleDrawer } from "./schedule/ScheduleDrawer.js";
import { useToast } from "./ui/Toast.js";
import { ApiError } from "../lib/api.js";
import { cancelCardSchedule, rescheduleCard } from "../lib/cards-api.js";
import type { CardToolPart } from "../lib/chat-types.js";
import { formatShortDateTime } from "../lib/format-date.js";
import { NETWORK_LABELS } from "../lib/network-labels.js";

const ARCHETYPE_LABEL: Record<string, string> = {
  "tool-crear_borrador_visual": "Post visual",
  "tool-crear_borrador_video": "Guion de video",
  "tool-crear_borrador_texto": "Post de texto",
};

const BADGE_LABEL: Record<CardStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  published: "Publicado",
  canceled: "Cancelado",
  failed: "Falló",
};

const BADGE_CLASSES: Record<CardStatus, string> = {
  draft: "bg-tint-plum text-accent",
  scheduled: "bg-info-bg text-info",
  published: "bg-success-bg text-success",
  canceled: "bg-secondary text-fg-muted",
  failed: "bg-error-bg text-error",
};

export function PublicationCard({
  part,
  liveCard,
  siblingCards,
  onCardsChanged,
}: {
  part: CardToolPart;
  /** Estado vivo desde publication_cards — undefined mientras useChatCards carga. */
  liveCard: PublicationCardDto | undefined;
  /** Otras cards del mismo groupId, todas en draft (adaptación multi-red aún sin tocar). */
  siblingCards: PublicationCardDto[];
  onCardsChanged: () => void;
}) {
  const label = ARCHETYPE_LABEL[part.type] ?? "Borrador";
  const toast = useToast();
  const [drawerCards, setDrawerCards] = useState<PublicationCardDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Generando {label.toLowerCase()}…
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-line-subtle bg-error-bg p-3 text-sm text-error">
        No se pudo crear el borrador: {part.errorText}
      </div>
    );
  }

  if (part.state !== "output-available") return null;

  const { content, network } = part.output;

  // Mensajes persistidos antes de que la tool devolviera `content` (previo
  // a F3 PR3) traen output sin ese campo — sin este guard, truena al leer
  // content.archetype en vez de mostrar algo legible.
  if (!content) {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Borrador creado con una versión anterior — ábrelo en tu Biblioteca para verlo.
      </div>
    );
  }

  // El tool part solo sabe "recién creado" — el badge/toolbar reales vienen
  // de liveCard (estado vivo en publication_cards). Sin liveCard todavía
  // (useChatCards cargando o falló su fetch), se degrada a "draft": es el
  // estado real al nacer la card y nunca miente sobre algo peor.
  const status = liveCard?.status ?? "draft";

  function openScheduleDrawer() {
    if (!liveCard) return;
    // Batch solo al programar por primera vez (draft) con hermanas también
    // en draft — reprogramar/reintentar una card ya tocada es siempre
    // individual (cada red sigue su propio horario desde ahí en adelante).
    const isFirstSchedule = liveCard.status === "draft";
    const draftSiblings = siblingCards.filter((c) => c.status === "draft");
    setDrawerCards(
      isFirstSchedule && draftSiblings.length > 0 ? [liveCard, ...draftSiblings] : [liveCard],
    );
  }

  function handleScheduleDone() {
    setDrawerCards(null);
    onCardsChanged();
  }

  async function handleCancel() {
    if (!liveCard || liveCard.status !== "scheduled") return;
    const previous = {
      socialAccountId: liveCard.socialAccountId,
      scheduledAt: liveCard.scheduledAt,
    };
    setBusy(true);
    try {
      await cancelCardSchedule(liveCard.id);
      onCardsChanged();
      toast.show({
        title: "Programación cancelada",
        description: "Vuelve a borrador.",
        onUndo:
          previous.socialAccountId && previous.scheduledAt
            ? () => {
                rescheduleCard(liveCard.id, {
                  socialAccountId: previous.socialAccountId!,
                  scheduledAt: previous.scheduledAt!,
                })
                  .then(onCardsChanged)
                  .catch((err: unknown) => {
                    toast.show({
                      title:
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo deshacer — ese horario ya no es válido.",
                    });
                  });
              }
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-secondary uppercase">{label}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-tint-plum px-2 py-0.5 text-xs text-fg-secondary">
            {NETWORK_LABELS[network] ?? network}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[status]}`}>
            {BADGE_LABEL[status]}
          </span>
        </div>
      </div>

      {status === "scheduled" && liveCard?.scheduledAt && (
        <Banner variant="info">
          Programado para el {formatShortDateTime(liveCard.scheduledAt)}
        </Banner>
      )}
      {status === "published" && liveCard?.publishedAt && (
        <Banner variant="success">Publicado el {formatShortDateTime(liveCard.publishedAt)}</Banner>
      )}
      {status === "failed" && (
        <Banner variant="error">
          No se pudo confirmar esta publicación con el proveedor. Puedes reintentar.
        </Banner>
      )}

      {content.archetype === "visual_first" && (
        <>
          <p className="whitespace-pre-wrap text-fg">{content.caption}</p>
          {content.imagePrompt && (
            <p className="mt-2 text-xs text-fg-muted">Prompt de imagen: {content.imagePrompt}</p>
          )}
          <Hashtags tags={content.hashtags} />
        </>
      )}
      {content.archetype === "video_script" && (
        <>
          <p className="font-semibold text-fg">{content.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-fg">{content.script}</p>
          <p className="mt-2 text-sm text-fg-secondary">{content.caption}</p>
          {content.recordingNotes && (
            <p className="mt-2 text-xs text-fg-muted">
              Notas de grabación: {content.recordingNotes}
            </p>
          )}
          <Hashtags tags={content.hashtags} />
        </>
      )}
      {content.archetype === "text_first" && (
        <>
          <p className="whitespace-pre-wrap text-fg">{content.body}</p>
          <Hashtags tags={content.hashtags} />
        </>
      )}

      {liveCard && (
        <Toolbar
          status={status}
          busy={busy}
          onSchedule={openScheduleDrawer}
          onCancel={() => void handleCancel()}
        />
      )}

      {drawerCards && (
        <ScheduleDrawer
          cards={drawerCards}
          onClose={() => setDrawerCards(null)}
          onDone={handleScheduleDone}
        />
      )}
    </div>
  );
}

function Banner({
  variant,
  children,
}: {
  variant: "info" | "success" | "error";
  children: React.ReactNode;
}) {
  const classes = {
    info: "bg-info-bg text-info",
    success: "bg-success-bg text-success",
    error: "bg-error-bg text-error",
  }[variant];
  return (
    <div className={`mb-3 rounded-md px-3 py-2 text-xs font-medium ${classes}`}>{children}</div>
  );
}

function Hashtags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return <p className="mt-2 text-xs text-brand">{tags.map((t) => `#${t}`).join(" ")}</p>;
}

// "Próximamente": Editar/Adaptar/Regenerar/Expandir/Ver estadísticas/Ver
// post no existen todavía (dependen de módulos fuera de F6) — se muestran
// deshabilitadas en vez de inventarse, mismo criterio que el resto del plan.
function DisabledAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Próximamente"
      className="cursor-not-allowed rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted opacity-60"
    >
      {label}
    </button>
  );
}

function Toolbar({
  status,
  busy,
  onSchedule,
  onCancel,
}: {
  status: CardStatus;
  busy: boolean;
  onSchedule: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {status === "draft" && (
        <>
          <button
            type="button"
            onClick={onSchedule}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
          >
            Programar
          </button>
          <DisabledAction label="Editar" />
          <DisabledAction label="Adaptar" />
          <DisabledAction label="Regenerar" />
        </>
      )}
      {status === "scheduled" && (
        <>
          <button
            type="button"
            onClick={onSchedule}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
          >
            Reprogramar
          </button>
          <DisabledAction label="Editar" />
          <DisabledAction label="Adaptar" />
          <span className="mx-1 h-4 w-px bg-line" />
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-error px-3 py-1.5 text-xs font-medium text-error disabled:opacity-60"
          >
            Cancelar programación
          </button>
        </>
      )}
      {status === "failed" && (
        <>
          <button
            type="button"
            onClick={onSchedule}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
          >
            Reintentar
          </button>
          <DisabledAction label="Editar" />
        </>
      )}
      {status === "published" && (
        <>
          <DisabledAction label="Ver estadísticas" />
          <DisabledAction label="Adaptar a otra red" />
          <DisabledAction label="Ver post" />
        </>
      )}
    </div>
  );
}
