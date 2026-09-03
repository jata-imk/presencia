// Utilidades de fecha compartidas por MiniCalendar/WeekStrip/ScheduleDrawer.
// Semana empieza en lunes (convención ya usada en el mockup de Claude Design).

export const WEEKDAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

export const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Domingo de la semana que contiene a `date`. Alineado con `WEEK_START` del
 * Calendario (lib/calendar/tz.ts): el usuario programa desde el drawer y
 * vuelve a la grilla en el mismo flujo, así que ver una tira que empieza en
 * lunes y un mes que empieza en domingo se lee como un error.
 *
 * Sigue con `Date` nativo en vez de @internationalized/date porque todo este
 * módulo trabaja en hora local del navegador (deuda anotada desde F6); el
 * único cambio acá es el día en que arranca.
 */
export function startOfCalendarWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function combineDateAndTime(date: Date, time: string): Date | null {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
