import { AlertTriangle } from "lucide-react";
import { dateKey, startOfWeekMonday, WEEKDAY_LABELS } from "./date-utils.js";

// Portado de WeekStrip (Chat Part 3.html). La semana se calcula alrededor
// de `selectedDate`; los marcadores y el conflicto vienen de datos reales
// (ver ScheduleDrawer).
export function WeekStrip({
  selectedDate,
  onSelectDate,
  markers,
  hasConflict,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markers: Record<string, number>;
  hasConflict: boolean;
}) {
  const weekStart = startOfWeekMonday(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const key = dateKey(day);
        const active = key === dateKey(selectedDate);
        const conflictHere = active && hasConflict;
        const count = markers[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(day)}
            className={`relative flex min-h-15 flex-col items-center gap-0.5 rounded-lg border px-1 py-2 ${
              active
                ? conflictHere
                  ? "border-warning bg-warning-bg"
                  : "border-primary bg-ai-bg"
                : "border-line bg-card"
            }`}
          >
            <span className="text-[9px] font-bold text-fg-muted">
              {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
            </span>
            <span className={`text-sm font-bold ${active ? "text-brand" : "text-fg"}`}>
              {day.getDate()}
            </span>
            <div className="mt-0.5 flex min-h-1.5 gap-0.5">
              {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <span key={i} className="size-1 rounded-full bg-pink-orchid" />
              ))}
            </div>
            {conflictHere && (
              <AlertTriangle
                size={10}
                className="absolute top-0.5 right-0.5 text-warning"
                strokeWidth={2}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
