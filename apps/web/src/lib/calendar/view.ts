// Las tres vistas del Calendario y su estado en la URL (F7).
//
// El estado vive en la query string, no en un store: así el back del
// navegador funciona, la vista se puede compartir por link, y el deep-link
// "Ver en calendario" de una card de Chat (PR2) es simplemente una URL.
//
// Los valores son las palabras en español que ve el usuario porque la URL
// es parte de la interfaz — /calendario?v=semana se lee solo.

export const CALENDAR_VIEWS = ["mes", "semana", "dia"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export function parseView(value: string | null): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as CalendarView)
    : "mes";
}
