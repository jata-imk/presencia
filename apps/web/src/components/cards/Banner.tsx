import { ArrowRight, BarChart2, CalendarCheck2, CheckCircle2 } from "lucide-react";
import { formatShortDateTime } from "../../lib/format-date.js";

// Portado de BannerScheduled/BannerPublished (arquetipos.jsx). El mockup
// muestra métricas de ejemplo ("1,284 vistas · 142 me gusta…") — no hay
// Analíticas real todavía (fuera de F6), así que esa línea se omite en vez
// de inventar números. "Ver en calendario"/"Ver estadísticas" quedan
// deshabilitados: no hay ruta de Calendario ni de Analíticas todavía.
export function ScheduledBanner({ scheduledAt }: { scheduledAt: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-info-border bg-info-bg px-4 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-info-border">
        <CalendarCheck2 size={14} className="text-info" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-info">
          Programado para el {formatShortDateTime(scheduledAt)}
        </p>
        <p className="text-[10px] text-info">Se publicará automáticamente</p>
      </div>
      <div
        title="Próximamente"
        className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-md bg-card px-2 py-1 opacity-60"
      >
        <span className="text-[11px] font-semibold text-info">Ver en calendario</span>
        <ArrowRight size={11} className="text-info" strokeWidth={2} />
      </div>
    </div>
  );
}

export function PublishedBanner({ publishedAt }: { publishedAt: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-success-border bg-success-bg px-4 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success-border">
        <CheckCircle2 size={14} className="text-success" strokeWidth={2.25} />
      </div>
      <p className="flex-1 text-xs font-semibold text-success">
        Publicado el {formatShortDateTime(publishedAt)}
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
