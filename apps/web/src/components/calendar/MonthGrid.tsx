import { useEffect, useRef } from "react";
import { type CalendarDate, isSameMonth } from "@internationalized/date";
import { capEntries, type EntriesByDay } from "../../lib/calendar/group.js";
import { monthWeeks } from "../../lib/calendar/grid.js";
import { dayKey, formatDayLong, formatWeekdayShort, weekStart } from "../../lib/calendar/tz.js";
import { CalendarEntryPill } from "./CalendarEntryPill.js";

// Grilla del mes (F7 PR1).
//
// No scrollea: 5-6 filas `1fr` que llenan el alto disponible. Es una
// decisión de layout, no de estilo — el módulo ya tiene regiones con scroll
// propio (panel de borradores, panel del día) y agregarle una tercera a la
// grilla misma es lo que ADR-014 pide evitar.
//
// Accesibilidad: role="grid" con roving tabindex. Solo una celda es
// tabbable; las flechas mueven el foco entre días y, si el día nuevo cae
// fuera del mes visible, el padre navega de periodo y el foco lo sigue. Las
// filas usan `display: contents` para existir en el árbol de accesibilidad
// sin romper la grilla CSS de 7 columnas.

interface MonthGridProps {
  month: CalendarDate;
  today: CalendarDate;
  focusedDay: CalendarDate;
  entriesByDay: EntriesByDay;
  timeZone: string;
  onFocusDay: (day: CalendarDate) => void;
  onSelectDay: (day: CalendarDate) => void;
}

export function MonthGrid({
  month,
  today,
  focusedDay,
  entriesByDay,
  timeZone,
  onFocusDay,
  onSelectDay,
}: MonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = monthWeeks(month);
  const focusedKey = dayKey(focusedDay);

  // Mover el foco del DOM detrás del estado, pero SOLO si el movimiento salió
  // del teclado dentro de la grilla: si no, entrar a la página le robaría el
  // foco al usuario desde donde esté (la topbar, el sidebar).
  //
  // La intención se marca en un ref durante el keydown y NO se relee
  // `document.activeElement` en el efecto: cuando el día nuevo cae en otro
  // mes, la celda que tenía el foco se desmonta antes de que corran los
  // efectos, así que para entonces activeElement ya es <body> y el chequeo
  // daba falso justo en el caso que hay que cubrir — PageDown desde el 15 de
  // agosto dejaba el foco en la nada y las flechas siguientes no hacían nada.
  const keyboardMove = useRef(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !keyboardMove.current) return;
    keyboardMove.current = false;
    grid.querySelector<HTMLElement>(`[data-day="${focusedKey}"]`)?.focus();
  }, [focusedKey]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => CalendarDate> = {
      ArrowLeft: () => focusedDay.subtract({ days: 1 }),
      ArrowRight: () => focusedDay.add({ days: 1 }),
      ArrowUp: () => focusedDay.subtract({ weeks: 1 }),
      ArrowDown: () => focusedDay.add({ weeks: 1 }),
      Home: () => weekStart(focusedDay),
      End: () => weekStart(focusedDay).add({ days: 6 }),
      PageUp: () => focusedDay.subtract({ months: 1 }),
      PageDown: () => focusedDay.add({ months: 1 }),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      keyboardMove.current = true;
      onFocusDay(move());
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDay(focusedDay);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-line bg-card">
        {weeks[0]?.map((day, index) => (
          <div
            key={day.toString()}
            className={`px-3 py-2 font-display text-[11px] font-semibold tracking-wide uppercase ${
              index >= 5 ? "text-plum-200" : "text-fg-muted"
            }`}
          >
            {formatWeekdayShort(day)}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Calendario del mes"
        onKeyDown={handleKeyDown}
        className="grid min-h-0 flex-1 grid-cols-7 border-t border-line"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week) => (
          <div key={week[0]!.toString()} role="row" className="contents">
            {week.map((day) => {
              const key = dayKey(day);
              const outside = !isSameMonth(day, month);
              const isToday = day.compare(today) === 0;
              const { visible, hidden } = capEntries(entriesByDay.get(key) ?? []);
              return (
                <div
                  key={key}
                  role="gridcell"
                  data-day={key}
                  tabIndex={key === focusedKey ? 0 : -1}
                  aria-selected={key === focusedKey}
                  aria-label={formatDayLong(day)}
                  onClick={() => {
                    onFocusDay(day);
                    onSelectDay(day);
                  }}
                  className={`flex min-w-0 cursor-pointer flex-col gap-[3px] border-r border-b border-line p-1.5 outline-none nth-[7n]:border-r-0 ${
                    outside ? "bg-cal-day-out" : "bg-card"
                  } ${isToday ? "inset-ring-2 inset-ring-primary" : ""} focus-visible:inset-ring-2 focus-visible:inset-ring-line-focus`}
                >
                  <span
                    className={`flex h-[22px] items-center px-0.5 font-display text-[12.5px] font-semibold ${
                      outside ? "text-fg-muted" : "text-fg"
                    }`}
                  >
                    {isToday ? (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-primary-fg">
                        {day.day}
                      </span>
                    ) : (
                      day.day
                    )}
                  </span>

                  <div className="flex min-h-0 flex-col gap-[3px]">
                    {visible.map((entry) => (
                      <CalendarEntryPill key={entry.key} entry={entry} timeZone={timeZone} />
                    ))}
                    {hidden > 0 && (
                      <span className="self-start rounded px-1.5 font-display text-[10.5px] font-semibold text-accent">
                        +{hidden} más
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
