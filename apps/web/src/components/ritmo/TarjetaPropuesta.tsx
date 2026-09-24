import type { LucideIcon } from "lucide-react";
import { Clapperboard, CircleDashed, Layers, Sparkles, Square, Video } from "lucide-react";
import { TREND_FORMAT_LABELS, type TrendFormat } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import type { ConPropuesta } from "../../lib/ritmo/propuestas.js";

// La propuesta de publicación: de tendencia a acción.
//
// Traducida del `ProposalCard` del mock de Claude Design ("Presencia - Ritmo",
// ritmo/RitmoSections.jsx), y a propósito NO es la tarjeta de tendencia
// repintada: aquélla responde "qué se mueve" y cita su fuente; ésta responde
// "qué hago yo con eso" y termina en un botón. Por eso manda el título de la
// publicación, el gancho va aparte como cita, y la tendencia queda abajo como
// "Basado en".

/**
 * Tres familias de color, como el mock (que solo dibuja Reel, Carrusel y
 * Post): el video y la historia se pintan con su pariente más cercano y se
 * distinguen por el ícono y la etiqueta.
 */
const FORMATO: Record<TrendFormat, { Icono: LucideIcon; clase: string }> = {
  reel: { Icono: Clapperboard, clase: "bg-ritmo-formato-reel text-ritmo-formato-reel-fg" },
  video: { Icono: Video, clase: "bg-ritmo-formato-reel text-ritmo-formato-reel-fg" },
  carrusel: {
    Icono: Layers,
    clase: "bg-ritmo-formato-carrusel text-ritmo-formato-carrusel-fg",
  },
  historia: {
    Icono: CircleDashed,
    clase: "bg-ritmo-formato-carrusel text-ritmo-formato-carrusel-fg",
  },
  post: { Icono: Square, clase: "bg-ritmo-formato-post text-ritmo-formato-post-fg" },
};

export function TarjetaPropuesta({
  item,
  onCrear,
}: {
  item: ConPropuesta;
  onCrear: (item: ConPropuesta) => void;
}) {
  const formato = FORMATO[item.format];
  const red = NETWORK_META[item.network];
  return (
    <article className="flex h-full flex-col gap-3.5 rounded-[14px] border border-line bg-card p-5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${formato.clase}`}
        >
          <formato.Icono size={12} strokeWidth={1.75} aria-hidden />
          {TREND_FORMAT_LABELS[item.format]}
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-display text-[11.5px] font-semibold text-fg-muted">
          <red.Logo size={18} />
          {red.label}
        </span>
      </div>
      <h3 className="font-display text-base leading-tight font-semibold text-fg">
        {item.propuesta.titulo}
      </h3>
      <blockquote className="rounded-[10px] border-l-[3px] border-ritmo-gancho-border bg-ritmo-gancho px-3.5 py-3">
        <p className="mb-1 font-display text-[10px] font-bold tracking-wider text-fg-muted uppercase">
          Gancho
        </p>
        <p className="text-[13.5px] leading-normal text-brand italic">{item.propuesta.gancho}</p>
      </blockquote>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="min-w-0 flex-1 text-[11.5px] text-fg-muted">
          <span className="text-fg-secondary">Basado en:</span> {item.topic}
        </span>
        <button
          type="button"
          onClick={() => onCrear(item)}
          className="inline-flex items-center gap-2 rounded-[10px] bg-accent-cta px-4 py-2 font-display text-[13px] font-semibold text-accent-cta-fg transition hover:scale-[1.01] hover:bg-accent-cta-hover hover:shadow-md active:scale-[0.98]"
        >
          <Sparkles size={15} strokeWidth={2} aria-hidden />
          Crear en Chat
        </button>
      </div>
    </article>
  );
}
