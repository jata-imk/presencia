import {
  type CalendarDate,
  type ZonedDateTime,
  parseAbsolute,
  startOfWeek,
  toCalendarDate,
  today,
} from "@internationalized/date";

// Zona horaria y formato del Calendario (F7, ADR-018).
//
// La hora que se pinta es la del USUARIO (users.timezone, ej.
// America/Merida), no la del navegador. No es purismo: `scheduled_at` es
// timestamptz y viaja en UTC, así que si Jose viaja o tiene el SO en otra
// zona, un `new Date(iso).getHours()` le mostraría un horario que no es el
// que PostFast va a publicar. El resto de la app (components/schedule/
// date-utils.ts) todavía usa la zona del navegador — hueco conocido de F6;
// el Calendario no lo hereda.
//
// Este módulo es puro: no importa React ni la sesión, para que la
// matemática de fechas se pueda ejercitar fuera del navegador. El hook que
// resuelve la zona del usuario vive en use-timezone.ts.
//
// Toda la aritmética pasa por @internationalized/date: sumar 30 minutos o
// preguntar "¿a qué día pertenece esto?" cruzando un cambio de horario de
// verano es exactamente donde `Date` + setHours se equivoca en silencio.

export const CALENDAR_LOCALE = "es-MX";

/**
 * La semana empieza en DOMINGO, que es lo que dice el CLDR de es-MX y lo
 * que espera un usuario mexicano al abrir un calendario. F7 arrancó en
 * lunes tomando la spec al pie de la letra ("7 columnas, Lun a Dom") y el
 * QA manual lo corrigió: la spec describía una grilla, no una convención
 * regional.
 *
 * Se sigue pasando explícito aunque coincida con el default del locale:
 * deja el valor a la vista de quien lea el módulo y no depende de qué
 * decida CLDR en una versión futura.
 */
export const WEEK_START = "sun" as const;

/** ISO UTC (como viaja `scheduledAt`) → instante ubicado en la zona del usuario. */
export function zonedFromIso(iso: string, timeZone: string): ZonedDateTime {
  return parseAbsolute(iso, timeZone);
}

/** Clave `YYYY-MM-DD` para indexar por día. Estable, ordenable y sin sorpresas de locale. */
export function dayKey(value: CalendarDate | ZonedDateTime): string {
  return ("hour" in value ? toCalendarDate(value) : value).toString();
}

/** El día en que está el usuario ahora mismo, en SU zona (puede no ser el del navegador). */
export function todayIn(timeZone: string): CalendarDate {
  return today(timeZone);
}

/** Domingo de la semana que contiene a `date` (ver WEEK_START). */
export function weekStart(date: CalendarDate): CalendarDate {
  return startOfWeek(date, CALENDAR_LOCALE, WEEK_START);
}

/**
 * Rango [00:00 del primer día, 23:59:59.999 del último] convertido a
 * instantes reales, que es lo que entiende la API. El límite superior es
 * inclusivo porque `listByRange` usa `<=`: se toma la medianoche del día
 * siguiente y se le resta 1 ms, en vez de escribir 23:59:59.999 a mano —
 * así el cálculo sigue siendo correcto en un día de 23 o 25 horas.
 */
export function absoluteRange(
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string,
): { from: Date; to: Date } {
  return {
    from: from.toDate(timeZone),
    to: new Date(to.add({ days: 1 }).toDate(timeZone).getTime() - 1),
  };
}

// Un formatter POR ZONA, cacheado. Sin `timeZone` explícito, Intl formatea
// el instante en la zona del navegador — que es exactamente el bug que este
// módulo existe para evitar: un post de las 18:00 de Mérida abierto desde una
// laptop en Madrid se pintaría "01:00", y encima dentro de la celda del día
// anterior, porque dayKey() sí bucketea bien. La píldora contradiciendo a su
// propia celda.
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = timeFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  timeFormatters.set(timeZone, formatter);
  return formatter;
}

/** "18:00" en la zona del propio instante — 24 h siempre, nunca AM/PM. */
export function formatTime(value: ZonedDateTime): string {
  return timeFormatterFor(value.timeZone).format(value.toDate());
}

// Las piezas se componen a mano en vez de dejar que Intl arme la frase:
// es-MX devuelve "octubre de 2026" y "sábado, 24 de octubre", y la spec pide
// "Octubre 2026" y "Sábado 24 de octubre". Lo que sí sale de Intl son los
// nombres — no hay una tabla de meses hardcodeada acá.
const monthNameFormatter = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
  month: "long",
  timeZone: "UTC",
});
const weekdayLongFormatter = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
  weekday: "long",
  timeZone: "UTC",
});
const weekdayShortFormatter = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
  weekday: "short",
  timeZone: "UTC",
});

// Los formatters de fecha calendárica van fijados a UTC a propósito: reciben
// un CalendarDate (un día del calendario, sin instante), y el puente a Date
// se hace en UTC. Dejar que Intl aplique la zona local correría el día una
// casilla para cualquier usuario al oeste de Greenwich.
function asUtcDate(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Agosto 2026" — etiqueta del navegador temporal en vista mes. */
export function formatMonthLabel(date: CalendarDate): string {
  return `${capitalize(monthNameFormatter.format(asUtcDate(date)))} ${date.year}`;
}

/** "Viernes 24 de octubre" — encabezado del panel del día. */
export function formatDayLong(date: CalendarDate): string {
  const day = asUtcDate(date);
  return `${capitalize(weekdayLongFormatter.format(day))} ${date.day} de ${monthNameFormatter.format(day)}`;
}

/** "Lun", "Mar", … — encabezado de columna de la grilla. */
export function formatWeekdayShort(date: CalendarDate): string {
  // es-MX abrevia con punto ("sáb.") según la versión de ICU; se quita para
  // que las 7 etiquetas queden parejas.
  return capitalize(weekdayShortFormatter.format(asUtcDate(date)).replace(/\.$/, ""));
}

/**
 * "Hoy", "Mañana", "Ayer", "En 3 días", "Hace 4 días" — el subtítulo del
 * panel del día. Es lo que convierte una fecha en una ubicación mental: el
 * usuario no piensa "24 de octubre", piensa "mañana".
 */
export function formatRelativeDay(date: CalendarDate, today: CalendarDate): string {
  // CalendarDate.compare devuelve la diferencia en DÍAS, no en milisegundos
  // (ZonedDateTime.compare sí devuelve ms — es fácil confundirlas).
  const days = date.compare(today);
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days > 0) return `En ${String(days)} días`;
  return `Hace ${String(-days)} días`;
}

const scheduleFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * "27 de agosto, 18:00" — el horario de una publicación en el banner de la
 * card. En la zona del usuario y en 24 h, igual que el resto del producto:
 * el drawer programa eligiendo "18:00" (input type=time, siempre 24 h) y el
 * calendario pinta "18:00", así que un banner que dijera "06:00 p.m." en la
 * zona del navegador estaría contradiciendo a las dos superficies que
 * rodean a la misma card.
 */
export function formatScheduleDateTime(iso: string, timeZone: string): string {
  let formatter = scheduleFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(CALENDAR_LOCALE, {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });
    scheduleFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(iso));
}
