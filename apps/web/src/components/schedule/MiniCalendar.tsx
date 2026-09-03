import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateKey, MONTH_LABELS, startOfDay, WEEKDAY_LABELS } from "./date-utils.js";

// Portado de MiniCalendar (Chat Part 3.html) — el mockup era estático
// (mes/día/marcadores fijos). Acá: navegación real de mes, selección real
// de día, y los marcadores vienen de posts programados reales (ver
// ScheduleDrawer, que arma `markers` desde GET /api/cards/conflicts del
// mes visible) — no son datos de muestra.
export function MiniCalendar({
  viewMonth,
  onChangeMonth,
  selectedDate,
  onSelectDate,
  markers,
}: {
  viewMonth: Date;
  onChangeMonth: (month: Date) => void;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  markers: Record<string, number>;
}) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Cuántas celdas vacías van antes del día 1. getDay() ya devuelve
  // 0=domingo, que es donde arranca la semana (WEEK_START en
  // lib/calendar/tz.ts): el `+6 % 7` compensaba el arranque en lunes y
  // ahora correría el mes un día.
  const offset = new Date(year, month, 1).getDay();
  const today = startOfDay(new Date());

  return (
    <div className="rounded-lg border border-line bg-card px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onChangeMonth(new Date(year, month - 1, 1))}
          className="rounded-md p-1 text-fg-secondary hover:bg-secondary-hover"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-semibold text-fg capitalize">
          {MONTH_LABELS[month]} {year}
        </span>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onChangeMonth(new Date(year, month + 1, 1))}
          className="rounded-md p-1 text-fg-secondary hover:bg-secondary-hover"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="mb-1.5 grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="py-1 text-center text-[10px] font-bold text-fg-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = new Date(year, month, day);
          const key = dateKey(date);
          const isPast = date < today;
          const isToday = date.getTime() === today.getTime();
          const isSelected = selectedDate !== null && dateKey(selectedDate) === key;
          const markerCount = markers[key] ?? 0;
          return (
            <button
              key={day}
              type="button"
              disabled={isPast}
              onClick={() => onSelectDate(date)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium ${
                isSelected
                  ? "bg-primary font-bold text-primary-fg"
                  : isPast
                    ? "cursor-default text-fg-muted opacity-40"
                    : "cursor-pointer text-fg hover:bg-secondary-hover"
              } ${isToday && !isSelected ? "border border-pink-orchid" : ""}`}
            >
              {day}
              {markerCount > 0 && !isSelected && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {Array.from({ length: Math.min(markerCount, 3) }).map((_, i) => (
                    <span key={i} className="size-1 rounded-full bg-pink-orchid" />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
