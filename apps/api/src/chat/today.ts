// F10.10: la fecha de hoy en el prompt del chat. Sin ella el modelo solo
// conoce su fecha de corte, y una nota de junio que dice "este fin de semana"
// la presentaba como los planes de este fin de semana (en vivo, 2026-10-28).
// Puro, para que la suite cultural arme el mismo prompt que producción.

/** El default de `users.timezone` (schema.ts). */
export const DEFAULT_TIMEZONE = "America/Mexico_City";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** "martes, 28 de octubre de 2026" en el día LOCAL del creator. Una zona inválida cae al default. */
export function localDateLabel(now: Date, timezone: string): string {
  try {
    return formatterFor(timezone).format(now);
  } catch {
    return formatterFor(DEFAULT_TIMEZONE).format(now);
  }
}

/**
 * Va al final del prompt de sistema, no en el prompt base: cambia una vez al
 * día, y lo de arriba (base y voz) sigue igual para el caché del proveedor.
 * Solo el día, sin la hora: con la hora cambiaría en cada turno.
 */
export function todayInstruction(now: Date, timezone: string): string {
  return (
    `Hoy es ${localDateLabel(now, timezone)} (día del creator). Úsalo para entender ` +
    "'hoy', 'mañana' o 'este fin de semana', y compáralo con la fecha de lo que " +
    "encuentres en la web: un evento, un precio o una noticia de otra fecha no es de " +
    "ahora. No lo presentes como actual: di de cuándo es, o busca algo más reciente."
  );
}
