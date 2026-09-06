import { useEffect, useRef } from "react";
import type { CalendarDate } from "@internationalized/date";
import type { EntriesByDay } from "../../lib/calendar/group.js";
import {
  HOUR_HEIGHT,
  initialScrollTop,
  layoutDay,
  minutesFromOffset,
  SNAP_PX,
  topFor,
} from "../../lib/calendar/timeline.js";
import { dayKey, formatDayLong, formatRelativeDay, zonedFromIso } from "../../lib/calendar/tz.js";
import { HourLines, TimeAxis } from "./TimeAxis.js";
import { NowLine } from "./NowLine.js";
import { TimelineBlock } from "./TimelineBlock.js";
import type { TimelineDrag } from "./WeekGrid.js";

// Vista Día: una sola columna, el mismo eje de 24 horas.
//
// Sin banda lateral de horarios óptimos: esa se alimenta del Ritmo, que es
// una fase posterior, y una banda vacía esperando datos no es mejor que no
// tenerla. Lo que sí gana esta vista con todo el ancho disponible son bloques
// más ricos — que es su razón de existir frente a la vista semana.

export function DayTimeline({
  day,
  today,
  entriesByDay,
  timeZone,
  drag,
  conflictCardIds,
  draggingCardIds,
  onStartDragCard,
  onOpenCard,
}: {
  day: CalendarDate;
  today: CalendarDate;
  entriesByDay: EntriesByDay;
  timeZone: string;
  drag: TimelineDrag | null;
  conflictCardIds: Set<string>;
  draggingCardIds: ReadonlySet<string>;
  onStartDragCard?: (event: React.PointerEvent, cardIds: string[]) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const key = dayKey(day);
  const isToday = key === dayKey(today);
  const entries = entriesByDay.get(key) ?? [];
  const positioned = layoutDay(entries, timeZone);
  const total = entries.reduce((count, entry) => count + entry.cards.length, 0);
  const verdict = drag ? drag.verdictByDay.get(key) : undefined;
  const isOver = drag?.overDay === key;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = initialScrollTop(zonedFromIso(new Date().toISOString(), timeZone));
  }, [timeZone]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end gap-3 border-b border-line bg-card px-6 py-3.5">
        <h2 className="font-display text-xl font-bold text-brand">{formatDayLong(day)}</h2>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-display text-[11px] font-semibold text-accent">
          {formatRelativeDay(day, today)}
        </span>
        <span className="ml-auto text-xs text-fg-muted">
          {total === 0
            ? "Sin publicaciones"
            : `${String(total)} ${total === 1 ? "publicación" : "publicaciones"}`}
        </span>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <TimeAxis />
          <div
            data-drop-day={key}
            data-drop-time={SNAP_PX}
            className={`relative flex-1 ${verdict === "valid" ? "bg-cal-drop-valid" : ""} ${
              verdict === "conflict" ? "bg-cal-drop-conflict" : ""
            }`}
          >
            <HourLines />
            {verdict === "past" && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1] bg-cal-drop-past"
              />
            )}
            {isOver && verdict && verdict !== "past" && (
              <span
                aria-hidden
                className={`pointer-events-none absolute right-0 left-0 z-[3] rounded border-2 ${
                  verdict === "conflict" ? "border-warning" : "border-ai"
                }`}
                style={{
                  top: topFor(minutesFromOffset(drag.overOffsetY)),
                  height: HOUR_HEIGHT - 4,
                }}
              />
            )}
            {positioned.map((item) => (
              <TimelineBlock
                key={item.entry.key}
                positioned={item}
                timeZone={timeZone}
                compact={false}
                conflictCardIds={conflictCardIds}
                draggingCardIds={draggingCardIds}
                onStartDragCard={onStartDragCard}
                onOpenCard={onOpenCard}
              />
            ))}
            {isToday && <NowLine timeZone={timeZone} />}
          </div>
        </div>
      </div>
    </div>
  );
}
