import { HOUR_HEIGHT } from "../../lib/calendar/timeline.js";

// El eje de horas de las vistas Semana y Día, y las líneas que lo continúan
// dentro de cada columna. Se dibujan las 24 horas: recortar a 6:00–23:00
// haría que una publicación de las 02:00 exista en vista mes y no acá.

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function TimeAxis() {
  return (
    <div className="relative w-14 shrink-0 border-r border-line">
      {HOURS.map((hour) => (
        <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
          {/* La etiqueta cuelga hacia arriba de su línea, como en cualquier
              agenda: la marca de las 09:00 va sobre la línea de las 09:00,
              no dentro de la franja de las 09. */}
          {hour > 0 && (
            <span className="absolute -top-2 right-2 font-display text-[10px] text-fg-muted tabular-nums">
              {String(hour).padStart(2, "0")}:00
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Las líneas horarias de fondo de una columna. Puramente decorativas. */
export function HourLines() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute right-0 left-0 border-t border-line-subtle"
          style={{ top: hour * HOUR_HEIGHT }}
        />
      ))}
    </div>
  );
}
