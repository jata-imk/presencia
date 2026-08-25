import { useEffect, useState } from "react";
import { HOUR_HEIGHT, minutesOf, topFor } from "../../lib/calendar/timeline.js";
import { zonedFromIso } from "../../lib/calendar/tz.js";

// La línea de "ahora". Es lo que convierte un eje horario en algo vivo: sin
// ella hay que buscar la hora actual leyendo la regla de la izquierda.
//
// Se actualiza cada minuto, no cada segundo: la línea se mueve menos de un
// píxel por minuto (52px por hora), así que un tick más fino sería trabajo
// invisible.

export function NowLine({ timeZone }: { timeZone: string }) {
  const [minutes, setMinutes] = useState(() =>
    minutesOf(zonedFromIso(new Date().toISOString(), timeZone)),
  );

  useEffect(() => {
    const tick = () => setMinutes(minutesOf(zonedFromIso(new Date().toISOString(), timeZone)));
    tick();
    // Se alinea al minuto real en vez de disparar cada 60 s desde el montaje:
    // si no, la línea salta en un momento arbitrario del minuto.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [timeZone]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-0 left-0 z-[4] h-0.5 bg-accent-cta"
      style={{ top: topFor(minutes) }}
    >
      <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-accent-cta" />
    </div>
  );
}

export { HOUR_HEIGHT };
