import { type CalendarDate, endOfMonth, startOfMonth } from "@internationalized/date";
import { absoluteRange, weekStart } from "./tz.js";

// Geometría de las vistas del Calendario (F7). Todo acá es puro: recibe
// CalendarDate, devuelve CalendarDate. Nada de zona horaria salvo cuando hay
// que hablarle a la API, y para eso está `absoluteRange`.

/**
 * Semanas completas que cubren el mes, de domingo a sábado. Son 5 o 6 según
 * dónde caiga el 1 (presencia-calendario.md: "7 columnas × 5-6 filas"), no
 * 6 fijas: rellenar siempre a 6 dejaría una fila entera de días de otro mes
 * en la mitad de los meses, y con filas `1fr` eso le roba alto a los días
 * que sí importan.
 */
export function monthWeeks(month: CalendarDate): CalendarDate[][] {
  const first = weekStart(startOfMonth(month));
  const last = weekStart(endOfMonth(month)).add({ days: 6 });

  const weeks: CalendarDate[][] = [];
  let cursor = first;
  while (cursor.compare(last) <= 0) {
    const week: CalendarDate[] = [];
    for (let index = 0; index < 7; index += 1) {
      week.push(cursor);
      cursor = cursor.add({ days: 1 });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Los 7 días (Dom→Sáb) de la semana que contiene a `date`. */
export function weekDays(date: CalendarDate): CalendarDate[] {
  const first = weekStart(date);
  return Array.from({ length: 7 }, (_, index) => first.add({ days: index }));
}

/**
 * El rango absoluto que hay que pedirle a la API para pintar una vista. Se
 * calcula sobre los días REALMENTE visibles (incluidos los del mes anterior
 * y el siguiente que rellenan la primera y última fila): si se pidiera solo
 * el mes natural, esos días saldrían siempre vacíos aunque tengan posts.
 */
export function rangeForDays(days: CalendarDate[], timeZone: string): { from: Date; to: Date } {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) throw new Error("rangeForDays necesita al menos un día");
  return absoluteRange(first, last, timeZone);
}
