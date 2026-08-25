import { AlertTriangle, Link2 } from "lucide-react";
import type { PublicationCardDto } from "@presencia/shared";
import { cardPreviewText } from "../cards/card-text.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import {
  BLOCK_MINUTES,
  HOUR_HEIGHT,
  isMovable,
  type PositionedEntry,
  topFor,
} from "../../lib/calendar/timeline.js";
import { formatTime, zonedFromIso } from "../../lib/calendar/tz.js";

// Un bloque en el eje horario (vistas Semana y Día). Comparte lenguaje visual
// con la píldora de la vista mes — mismos tokens de estado, mismo tratamiento
// de grupo multi-red — pero acá la POSICIÓN significa la hora, así que el
// bloque va posicionado en absoluto y ocupa el alto de una hora.

const TONE: Record<string, string> = {
  scheduled: "border-info-border bg-info-bg text-cal-scheduled-fg",
  published: "border-success-border bg-success-bg text-cal-published-fg opacity-85",
  draft: "border-ai-border bg-ai-bg text-cal-draft-fg",
  failed: "border-error-border bg-error-bg text-error",
  canceled: "border-line bg-secondary text-fg-muted",
};

export function TimelineBlock({
  positioned,
  timeZone,
  compact,
  conflictCardIds,
  draggingCardId,
  onStartDragCard,
  onOpenCard,
}: {
  positioned: PositionedEntry;
  timeZone: string;
  /** Vista semana: columnas angostas, una línea por red. Vista día: hay lugar para más. */
  compact: boolean;
  /**
   * Cards que chocan con otra de la misma red a la misma hora exacta. Se
   * marcan igual que en vista mes: el conflicto es más visible acá, donde
   * los dos bloques comparten franja, así que ocultarlo justo en el eje
   * horario sería al revés de lo razonable.
   */
  conflictCardIds?: Set<string>;
  draggingCardId?: string | null;
  onStartDragCard?: (event: React.PointerEvent, cardId: string) => void;
  onOpenCard?: (cardId: string) => void;
}) {
  const { entry, minutes, lane, lanes } = positioned;
  const first = entry.cards[0];
  if (!first) return null;

  // Los carriles reparten el ancho de la columna entre las entradas que se
  // pisan. Con un solo carril el bloque ocupa todo (menos un margen).
  const width = `calc(${String(100 / lanes)}% - 6px)`;
  const left = `calc(${String((100 / lanes) * lane)}% + 3px)`;

  const handlers = (card: PublicationCardDto) => ({
    onPointerDown:
      onStartDragCard && isMovable(card)
        ? (event: React.PointerEvent) => {
            event.stopPropagation();
            onStartDragCard(event, card.id);
          }
        : undefined,
    onClick: onOpenCard
      ? (event: React.MouseEvent) => {
          event.stopPropagation();
          onOpenCard(card.id);
        }
      : undefined,
  });

  // touchAction viaja DENTRO de position, no como prop aparte: en JSX un
  // `style={...}` explícito después de un spread pisa el style del spread
  // entero, así que `touch-action: none` se perdía y en una pantalla táctil
  // el gesto se lo comía el scroll del eje.
  const position = (card: PublicationCardDto) => ({
    top: topFor(minutes),
    minHeight: (BLOCK_MINUTES / 60) * HOUR_HEIGHT - 4,
    width,
    left,
    ...(onStartDragCard && isMovable(card) ? { touchAction: "none" as const } : {}),
  });

  if (entry.isGroup) {
    return (
      <div
        className="absolute z-[2] overflow-hidden rounded-lg border-l-[3px] border-l-ai bg-cal-group shadow-xs"
        style={position(first)}
        title={`Publicación multi-red · ${entry.cards.length} redes`}
      >
        <div className="flex items-center gap-1 px-1.5 pt-1 pb-0.5">
          <Link2 size={9} className="shrink-0 text-accent" aria-hidden />
          <span className="font-display text-[8.5px] font-bold tracking-wide text-accent uppercase">
            Multi-red · {entry.cards.length}
          </span>
        </div>
        {entry.cards.map((card) => {
          const meta = NETWORK_META[card.network];
          return (
            <span
              key={card.id}
              {...handlers(card)}
              style={onStartDragCard && isMovable(card) ? { touchAction: "none" } : undefined}
              className={`flex min-w-0 items-center gap-1 px-1.5 py-0.5 ${
                onStartDragCard && isMovable(card) ? "cursor-grab active:cursor-grabbing" : ""
              } ${card.id === draggingCardId ? "opacity-40" : ""}`}
            >
              <meta.Logo size={10} />
              <span className="truncate text-[9.5px] text-fg">
                {compact ? meta.label : cardPreviewText(card.content)}
              </span>
              {conflictCardIds?.has(card.id) && (
                <AlertTriangle
                  size={10}
                  strokeWidth={2.5}
                  className="ml-auto shrink-0 text-warning"
                  aria-label="Conflicto de horario"
                />
              )}
            </span>
          );
        })}
      </div>
    );
  }

  const meta = NETWORK_META[first.network];
  const tone = TONE[first.status] ?? TONE.draft!;
  const movable = onStartDragCard && isMovable(first);

  return (
    <div
      {...handlers(first)}
      className={`absolute z-[2] flex flex-col gap-0.5 overflow-hidden rounded-lg border px-1.5 py-1 shadow-xs ${tone} ${
        movable ? "cursor-grab active:cursor-grabbing" : ""
      } ${first.id === draggingCardId ? "opacity-40" : ""}`}
      style={position(first)}
      title={`${formatTime(zonedFromIso(entry.scheduledAt, timeZone))} · ${meta.label} — ${cardPreviewText(first.content)}`}
    >
      <span className="flex items-center gap-1">
        <meta.Logo size={11} />
        <span className="font-display text-[10px] font-bold tabular-nums">
          {formatTime(zonedFromIso(entry.scheduledAt, timeZone))}
        </span>
        {conflictCardIds?.has(first.id) && (
          <AlertTriangle
            size={11}
            strokeWidth={2.5}
            className="ml-auto shrink-0 text-warning"
            aria-label="Conflicto de horario"
          />
        )}
      </span>
      <span className={`text-[10px] leading-snug ${compact ? "truncate" : "line-clamp-3"}`}>
        {cardPreviewText(first.content)}
      </span>
    </div>
  );
}
