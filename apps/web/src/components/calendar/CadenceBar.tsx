import { Activity } from "lucide-react";
import type { CalendarDate } from "@internationalized/date";
import type { PublicationCardDto, SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { dayKey, weekStart, zonedFromIso } from "../../lib/calendar/tz.js";

// Indicador de cadencia (presencia-calendario.md §3): información
// ambiental, no acción. El usuario la mira de reojo — si compitiera
// visualmente con la grilla, estaría mal.
//
// SIN metas todavía. El diseño muestra "●●●○○ 3/5", pero el 5 sale de los
// objetivos semanales que se configuran en Ritmo, que es F9. Los conteos, en
// cambio, son datos que ya tenemos y son verdad. Cuando llegue Ritmo, esta
// barra gana los dots y el denominador; hasta entonces no inventa un
// objetivo ni pinta un progreso contra la nada.
//
// Solo en vista mes y semana: en vista día no tiene sentido medir cadencia
// (un día no es una semana) y sería ruido sin valor.

export function CadenceBar({
  cards,
  weekOf,
  today,
  timeZone,
  filtered = false,
}: {
  cards: PublicationCardDto[];
  /**
   * Qué semana se mide. En vista mes es HOY: el usuario está mirando un mes
   * entero, no una semana, y anclarla al día enfocado haría que la barra
   * cambiara con cada click en una celda — ruido en una tira que es
   * información ambiental. En vista semana (PR4) es el día visible, que ahí
   * sí es la unidad que el usuario tiene delante.
   */
  weekOf: CalendarDate;
  today: CalendarDate;
  timeZone: string;
  /**
   * Hay filtros activos. Los conteos son siempre de lo que se ve —si no,
   * dirían una cosa y la grilla otra— pero el mensaje de "no hay nada"
   * tiene que decir la verdad: con un filtro puesto, vacío no significa
   * "no programaste nada", significa "nada pasó el filtro".
   */
  filtered?: boolean;
}) {
  const start = weekStart(weekOf);
  const end = start.add({ days: 6 });
  const from = dayKey(start);
  const to = dayKey(end);

  const counts = new Map<SocialNetwork, number>();
  for (const card of cards) {
    if (!card.scheduledAt) continue;
    if (card.status !== "scheduled" && card.status !== "published") continue;
    const key = dayKey(zonedFromIso(card.scheduledAt, timeZone));
    if (key < from || key > to) continue;
    counts.set(card.network, (counts.get(card.network) ?? 0) + 1);
  }

  const isCurrentWeek = weekStart(today).compare(start) === 0;
  const label = isCurrentWeek ? "esta semana" : `semana del ${String(start.day)}`;

  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-card px-5 py-2">
      <span className="flex shrink-0 items-center gap-1.5 font-display text-[10px] font-bold tracking-wider text-fg-muted uppercase">
        <Activity size={12} strokeWidth={2} />
        Cadencia
      </span>
      {counts.size === 0 ? (
        <span className="shrink-0 text-[11px] text-fg-muted">
          {filtered
            ? `Nada coincide con los filtros ${isCurrentWeek ? "esta semana" : "esa semana"}.`
            : `Nada programado para ${isCurrentWeek ? "esta semana" : "esa semana"}.`}
        </span>
      ) : (
        [...counts.entries()].map(([network, count]) => {
          const meta = NETWORK_META[network];
          return (
            <span key={network} className="flex shrink-0 items-center gap-1.5">
              <meta.Logo size={13} />
              <span className="font-display text-[11.5px] font-medium text-fg-secondary">
                {meta.label}
              </span>
              <span className="font-display text-[11px] font-bold text-fg tabular-nums">
                {count}
              </span>
            </span>
          );
        })
      )}
      {/* El sufijo solo acompaña a los conteos: el mensaje de vacío ya
          nombra la semana, y ponerlo igual daba "Nada programado para esta
          semana. · esta semana". */}
      {counts.size > 0 && <span className="shrink-0 text-[11px] text-fg-muted">· {label}</span>}
    </div>
  );
}
