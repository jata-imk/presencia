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
import { dayKey, formatWeekdayShort, zonedFromIso } from "../../lib/calendar/tz.js";
import { weekDays } from "../../lib/calendar/grid.js";
import type { DropVerdict } from "../../lib/calendar/schedule-move.js";
import { HourLines, TimeAxis } from "./TimeAxis.js";
import { NowLine } from "./NowLine.js";
import { TimelineBlock } from "./TimelineBlock.js";

// Vista Semana: 7 columnas por un eje de 24 horas.
//
// A diferencia de la vista mes, acá la POSICIÓN VERTICAL es la hora — y eso
// cambia la semántica del arrastre: soltar en la columna del martes a la
// altura de las 14:00 programa martes 14:00. En mes, mover conserva la hora
// porque no hay eje que diga otra cosa.
//
// Esta vista SÍ tiene su propia zona de scroll (el eje no entra en pantalla).
// Es una región, no un eje encimado sobre otro — permitido por el addendum de
// ADR-014.

export interface TimelineDrag {
  overDay: string | null;
  overOffsetY: number;
  verdictByDay: Map<string, DropVerdict>;
}

interface WeekGridProps {
  anchor: CalendarDate;
  today: CalendarDate;
  entriesByDay: EntriesByDay;
  timeZone: string;
  drag: TimelineDrag | null;
  /** Cards que chocan con otra de la misma red a la misma hora exacta. */
  conflictCardIds: Set<string>;
  draggingCardIds: ReadonlySet<string>;
  onStartDragCard?: (event: React.PointerEvent, cardIds: string[]) => void;
  onOpenCard: (cardId: string) => void;
  onSelectDay: (day: CalendarDate) => void;
}

const COLUMN_TONE: Record<DropVerdict, string> = {
  valid: "bg-cal-drop-valid",
  conflict: "bg-cal-drop-conflict",
  past: "",
};

export function WeekGrid({
  anchor,
  today,
  entriesByDay,
  timeZone,
  drag,
  conflictCardIds,
  draggingCardIds,
  onStartDragCard,
  onOpenCard,
  onSelectDay,
}: WeekGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const days = weekDays(anchor);
  const todayKey = dayKey(today);
  const totalHeight = 24 * HOUR_HEIGHT;

  // Abrir mirando lo inmediato, no la madrugada. Solo al montar: si se
  // recalculara al cambiar de semana, el scroll saltaría bajo el usuario.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = initialScrollTop(zonedFromIso(new Date().toISOString(), timeZone));
  }, [timeZone]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-line bg-card">
        <div className="w-14 shrink-0 border-r border-line" />
        {days.map((day) => {
          const isToday = dayKey(day) === todayKey;
          return (
            <button
              key={dayKey(day)}
              type="button"
              onClick={() => onSelectDay(day)}
              className="flex flex-1 items-center justify-center gap-1.5 border-r border-line py-2 last:border-r-0 hover:bg-secondary"
            >
              <span
                className={`font-display text-[10.5px] font-semibold uppercase ${
                  isToday ? "text-brand" : "text-fg-muted"
                }`}
              >
                {formatWeekdayShort(day)}
              </span>
              <span
                className={`font-display text-base font-semibold ${
                  isToday
                    ? "flex size-6 items-center justify-center rounded-full bg-primary text-primary-fg"
                    : "text-fg"
                }`}
              >
                {day.day}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: totalHeight }}>
          <TimeAxis />
          {days.map((day) => {
            const key = dayKey(day);
            const verdict = drag ? drag.verdictByDay.get(key) : undefined;
            const isOver = drag?.overDay === key;
            const positioned = layoutDay(entriesByDay.get(key) ?? [], timeZone);
            return (
              <div
                key={key}
                data-drop-day={key}
                // Marca que este destino tiene eje horario: el motor del
                // arrastre lo usa para saber que el offset vertical
                // significa algo y hay que re-renderizar al moverse.
                data-drop-time={SNAP_PX}
                className={`relative flex-1 border-r border-line last:border-r-0 ${
                  key === todayKey ? "bg-cal-group" : ""
                } ${verdict ? COLUMN_TONE[verdict] : ""}`}
              >
                <HourLines />
                {verdict === "past" && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[1] bg-cal-drop-past"
                  />
                )}
                {/* La franja donde va a caer, imantada al cuarto de hora.
                    Sin esto el usuario ve el día pero no la hora, que es
                    justamente lo que esta vista agrega. */}
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
                    compact
                    conflictCardIds={conflictCardIds}
                    draggingCardIds={draggingCardIds}
                    onStartDragCard={onStartDragCard}
                    onOpenCard={onOpenCard}
                  />
                ))}
                {key === todayKey && <NowLine timeZone={timeZone} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
