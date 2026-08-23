import { BarChart2, Clock, Eye, Link2, MessageSquare, MoreVertical, XCircle } from "lucide-react";
import type { PublicationCardDto } from "@presencia/shared";
import { Badge } from "../cards/Badge.js";
import { badgeKindFor } from "../cards/PublicationCardView.js";
import { cardPreviewText } from "../cards/card-text.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { MENU_ITEM_CLASS, Menu } from "../ui/Menu.js";
import { formatTime, zonedFromIso } from "../../lib/calendar/tz.js";
import { summarizeGroupStatuses, type CalendarEntry } from "../../lib/calendar/group.js";

// Mini-card del panel del día: hora prominente, red, badge, 2-3 líneas del
// texto y menú ⋮ (presencia-calendario.md §3).
//
// El grupo multi-red se dibuja como un contenedor con header y acciones
// bulk. Son las ÚNICAS acciones bulk de V1: el grupo es una unidad
// conceptual, "seleccionar varios posts sueltos" es no-objetivo (§7).

export interface DayCardActions {
  onView: (card: PublicationCardDto) => void;
  onEditInChat: (card: PublicationCardDto) => void;
  onReschedule: (cards: PublicationCardDto[]) => void;
  onCancel: (cards: PublicationCardDto[]) => void;
}

function CardRow({
  card,
  actions,
  isPast,
  inGroup,
  timeZone,
  highlighted,
}: {
  card: PublicationCardDto;
  actions: DayCardActions;
  isPast: boolean;
  inGroup: boolean;
  timeZone: string;
  highlighted: boolean;
}) {
  const meta = NETWORK_META[card.network];
  const time = card.scheduledAt ? formatTime(zonedFromIso(card.scheduledAt, timeZone)) : "";
  const canAct = card.status === "scheduled" || card.status === "failed";

  return (
    <div
      // scroll-mt para que el scrollIntoView del deep-link no deje la card
      // pegada al borde superior del panel.
      data-card-id={card.id}
      className={`flex scroll-mt-3 gap-3 px-3 py-2.5 transition-shadow ${
        inGroup
          ? "border-t border-ai-border first:border-t-0"
          : "rounded-xl border border-line bg-card"
      } ${highlighted ? "inset-ring-2 inset-ring-line-focus" : ""}`}
    >
      <span className="w-11 shrink-0 pt-0.5 font-display text-sm font-bold text-fg tabular-nums">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <meta.Logo size={14} />
          <span className="font-display text-xs font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <Badge kind={badgeKindFor(card.content.archetype, card.status)} small />
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-fg-secondary">
          {cardPreviewText(card.content)}
        </p>
      </div>
      <Menu placement="bottom-end">
        <Menu.Trigger
          aria-label={`Acciones de la publicación de ${meta.label}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary hover:text-brand"
        >
          <MoreVertical size={15} strokeWidth={1.75} />
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item onClick={() => actions.onView(card)} className={MENU_ITEM_CLASS}>
            <Eye size={14} strokeWidth={1.75} /> Ver
          </Menu.Item>
          {/* Un día pasado no se edita ni se reprograma: lo que ya salió, ya
              salió. El menú se recorta en vez de mostrar acciones que fallan
              (presencia-calendario.md §5, "Día pasado seleccionado"). */}
          {!isPast && (
            <>
              <Menu.Item
                onClick={() => actions.onEditInChat(card)}
                className={MENU_ITEM_CLASS}
                disabled={card.chatId === null}
                title={card.chatId === null ? "El chat que la originó ya no existe" : undefined}
              >
                <MessageSquare size={14} strokeWidth={1.75} /> Editar en Chat
              </Menu.Item>
              {canAct && (
                <>
                  <Menu.Item
                    onClick={() => actions.onReschedule([card])}
                    className={MENU_ITEM_CLASS}
                  >
                    <Clock size={14} strokeWidth={1.75} /> Reprogramar
                  </Menu.Item>
                  <Menu.Item onClick={() => actions.onCancel([card])} className={MENU_ITEM_CLASS}>
                    <XCircle size={14} strokeWidth={1.75} /> Cancelar programación
                  </Menu.Item>
                </>
              )}
            </>
          )}
          {card.status === "published" && (
            <Menu.Item
              disabled
              title="Analíticas llega en una fase posterior"
              className={`${MENU_ITEM_CLASS} text-fg-muted`}
            >
              <BarChart2 size={14} strokeWidth={1.75} /> Ver estadísticas
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu>
    </div>
  );
}

export function DayPanelCard({
  entry,
  actions,
  isPast,
  timeZone,
  highlightedCardId,
}: {
  entry: CalendarEntry;
  actions: DayCardActions;
  isPast: boolean;
  timeZone: string;
  highlightedCardId?: string | null;
}) {
  if (!entry.isGroup) {
    const card = entry.cards[0];
    if (!card) return null;
    return (
      <CardRow
        card={card}
        actions={actions}
        isPast={isPast}
        inGroup={false}
        timeZone={timeZone}
        highlighted={card.id === highlightedCardId}
      />
    );
  }

  const reschedulable = entry.cards.filter(
    (card) => card.status === "scheduled" || card.status === "failed",
  );

  return (
    <div className="overflow-hidden rounded-xl border border-ai-border bg-cal-group">
      <div className="flex items-center gap-2.5 border-b border-ai-border px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-card text-accent">
          <Link2 size={13} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-bold text-brand">Publicación multi-red</p>
          <p className="text-[11px] text-accent">{summarizeGroupStatuses(entry.cards)}</p>
        </div>
        {!isPast && reschedulable.length > 0 && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              title="Reprogramar todas"
              aria-label="Reprogramar todas las redes del grupo"
              onClick={() => actions.onReschedule(reschedulable)}
              className="flex size-7 items-center justify-center rounded-md text-accent transition-colors hover:bg-card"
            >
              <Clock size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              title="Cancelar todas"
              aria-label="Cancelar la programación de todas las redes del grupo"
              onClick={() => actions.onCancel(reschedulable)}
              className="flex size-7 items-center justify-center rounded-md text-error transition-colors hover:bg-card"
            >
              <XCircle size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
      <div className="bg-card">
        {entry.cards.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={actions}
            isPast={isPast}
            inGroup
            timeZone={timeZone}
            highlighted={card.id === highlightedCardId}
          />
        ))}
      </div>
    </div>
  );
}
