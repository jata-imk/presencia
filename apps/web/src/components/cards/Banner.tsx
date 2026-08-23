import { ArrowRight, BarChart2, CalendarCheck2, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";
import { dayKey, formatScheduleDateTime, zonedFromIso } from "../../lib/calendar/tz.js";
import { useTimezone } from "../../lib/calendar/use-timezone.js";

// Portado de BannerScheduled/BannerPublished (arquetipos.jsx). El mockup
// muestra métricas de ejemplo ("1,284 vistas · 142 me gusta…") — no hay
// Analíticas real todavía, así que esa línea se omite en vez de inventar
// números, y "Ver estadísticas" sigue apagado hasta F12.
//
// "Ver en calendario" sí funciona desde F7: el día se calcula en la zona
// del USUARIO, no en la del navegador — si no, un post de las 23:00 abriría
// el calendario en el día equivocado.
export function ScheduledBanner({
  scheduledAt,
  cardId,
  showCalendarLink = true,
}: {
  scheduledAt: string;
  /** Sin id no se puede resaltar la card al llegar; el link igual lleva al día. */
  cardId?: string;
  /** El modal "Ver" del propio Calendario lo apaga: ya estás ahí. */
  showCalendarLink?: boolean;
}) {
  const timeZone = useTimezone();
  const day = dayKey(zonedFromIso(scheduledAt, timeZone));
  const to = `/calendario?d=${day}${cardId ? `&card=${cardId}` : ""}`;
  return (
    <div className="flex items-center gap-2.5 border-b border-info-border bg-info-bg px-4 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-info-border">
        <CalendarCheck2 size={14} className="text-info" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-info">
          Programado para el {formatScheduleDateTime(scheduledAt, timeZone)}
        </p>
        <p className="text-[10px] text-info">Se publicará automáticamente</p>
      </div>
      {showCalendarLink && (
        <Link
          to={to}
          className="flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-1 transition-opacity hover:opacity-80"
        >
          <span className="text-[11px] font-semibold text-info">Ver en calendario</span>
          <ArrowRight size={11} className="text-info" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

export function PublishedBanner({ publishedAt }: { publishedAt: string }) {
  const timeZone = useTimezone();
  return (
    <div className="flex items-center gap-2.5 border-b border-success-border bg-success-bg px-4 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success-border">
        <CheckCircle2 size={14} className="text-success" strokeWidth={2.25} />
      </div>
      <p className="flex-1 text-xs font-semibold text-success">
        Publicado el {formatScheduleDateTime(publishedAt, timeZone)}
      </p>
      <div
        title="Próximamente"
        className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-md bg-card px-2 py-1 opacity-60"
      >
        <BarChart2 size={11} className="text-success" strokeWidth={2} />
        <span className="text-[11px] font-semibold text-success">Ver estadísticas</span>
      </div>
    </div>
  );
}
