import type { PublicationCardDto } from "@presencia/shared";
import { Link2 } from "lucide-react";
import { Tooltip } from "../ui/Tooltip.js";
import { cardPreviewText } from "../cards/card-text.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import type { CalendarEntry } from "../../lib/calendar/group.js";
import { formatTime, zonedFromIso } from "../../lib/calendar/tz.js";

// La píldora de un post dentro de una celda del mes.
//
// Los colores salen de --status-* (los mismos que el badge de la card en
// Chat, para que "programado" se vea igual en los dos módulos); lo único
// propio del calendario es --cal-*-fg, el color del texto sobre ese tinte
// (ver tokens.css §Calendario).

const TONE: Record<string, { box: string; text: string }> = {
  scheduled: { box: "border-info-border bg-info-bg", text: "text-cal-scheduled-fg" },
  published: { box: "border-success-border bg-success-bg", text: "text-cal-published-fg" },
  draft: { box: "border-ai-border bg-ai-bg", text: "text-cal-draft-fg" },
  failed: { box: "border-error-border bg-error-bg", text: "text-error" },
  canceled: { box: "border-line bg-secondary", text: "text-fg-muted" },
};

function toneFor(status: PublicationCardDto["status"]) {
  return TONE[status] ?? TONE.draft!;
}

function Row({
  card,
  timeZone,
  compact,
}: {
  card: PublicationCardDto;
  timeZone: string;
  compact: boolean;
}) {
  const meta = NETWORK_META[card.network];
  const time = card.scheduledAt ? formatTime(zonedFromIso(card.scheduledAt, timeZone)) : "";
  const summary = cardPreviewText(card.content);
  const tone = toneFor(card.status);

  const row = (
    <span className={`flex min-w-0 items-center gap-1.5 ${tone.text}`}>
      <meta.Logo size={13} />
      <span className="shrink-0 font-display text-[10px] font-bold tabular-nums">{time}</span>
      <span className={`truncate text-[11px] ${compact ? "opacity-90" : ""}`}>{summary}</span>
    </span>
  );

  // Dentro de un grupo (compact) la fila NO lleva su propio globito: el
  // contenedor ya tiene el suyo y los dos anclas se activarían con el mismo
  // hover, abriendo dos globitos encimados a pocos píxeles. Con `title`
  // nativo el navegador mostraba solo el de adentro y no se notaba.
  return compact ? row : <Tooltip label={`${time} · ${meta.label} — ${summary}`}>{row}</Tooltip>;
}

export function CalendarEntryPill({
  entry,
  timeZone,
  draggingCardIds,
  onStartDragCard,
  onOpenCard,
}: {
  entry: CalendarEntry;
  timeZone: string;
  draggingCardIds?: ReadonlySet<string>;
  onStartDragCard?: (event: React.PointerEvent, cardIds: string[]) => void;
  /**
   * Click en un post concreto abre SU vista, no la del día
   * (presencia-calendario.md §3: "intención específica vs intención
   * general"). La celda entera sigue abriendo el panel del día; por eso
   * cada píldora corta la propagación.
   */
  onOpenCard?: (cardId: string) => void;
}) {
  const first = entry.cards[0];
  if (!first) return null;

  // Solo lo programado (o lo que falló y se puede reintentar) se arrastra.
  // Lo publicado ya salió: moverlo no significa nada, y ofrecer el gesto
  // sería prometer algo que el backend rechaza — CardsService solo acepta
  // draft, scheduled y failed.
  // `dragCards` es lo que viaja al soltar; `card` es de quién es el click.
  // En un grupo son distintos a propósito: se arrastra el bloque entero pero
  // el click sigue abriendo la publicación que se tocó.
  const interactive = (card: PublicationCardDto, dragCards: PublicationCardDto[] = [card]) => {
    const movables = dragCards.filter((c) => c.status === "scheduled" || c.status === "failed");
    const movable = onStartDragCard && movables.length > 0;
    return {
      onPointerDown: movable
        ? (event: React.PointerEvent) => {
            event.stopPropagation();
            onStartDragCard(
              event,
              movables.map((c) => c.id),
            );
          }
        : undefined,
      onClick: onOpenCard
        ? (event: React.MouseEvent) => {
            // La celda de atrás abre el panel del día; este click es sobre
            // un post concreto y no debe llegar hasta ella.
            event.stopPropagation();
            onOpenCard(card.id);
          }
        : undefined,
      style: movable ? { touchAction: "none" as const } : undefined,
      className: movable ? "cursor-grab active:cursor-grabbing" : "",
    };
  };

  // Grupo multi-red: las N redes van como filas separadas unidas por un
  // border-left Pink Orchid continuo (§4). El border es lo que comunica
  // "estas van juntas"; cada fila conserva su estado propio, por eso el
  // contenedor no pinta un tinte de estado.
  if (entry.isGroup) {
    // El arrastre nace del CONTENEDOR y lleva las N redes: mover una sola
    // rompía el grupo en silencio, que es lo contrario de lo que se ve (un
    // bloque unido por un borde). El click sigue siendo por fila.
    const groupDrag = interactive(entry.cards[0]!, entry.cards);
    return (
      <Tooltip label={`Publicación multi-red · ${String(entry.cards.length)} redes`}>
        <div
          onPointerDown={groupDrag.onPointerDown}
          style={groupDrag.style}
          className={`flex flex-col overflow-hidden rounded-md border-l-[3px] border-l-ai bg-cal-group select-none ${groupDrag.className}`}
        >
          {entry.cards.map((card) => {
            const handlers = interactive(card);
            return (
              <span
                key={card.id}
                onClick={handlers.onClick}
                className={`flex min-w-0 items-center gap-1 px-1.5 py-0.5 ${
                  draggingCardIds?.has(card.id) ? "opacity-40" : ""
                }`}
              >
                <Link2 size={9} className="shrink-0 text-accent" aria-hidden />
                <Row card={card} timeZone={timeZone} compact />
              </span>
            );
          })}
        </div>
      </Tooltip>
    );
  }

  const tone = toneFor(first.status);
  const handlers = interactive(first);
  return (
    <div
      {...handlers}
      className={`rounded-md border px-1.5 py-0.5 select-none ${tone.box} ${handlers.className} ${
        first.status === "published" ? "opacity-85" : ""
      } ${draggingCardIds?.has(first.id) ? "opacity-40" : ""}`}
    >
      <Row card={first} timeZone={timeZone} compact={false} />
    </div>
  );
}
