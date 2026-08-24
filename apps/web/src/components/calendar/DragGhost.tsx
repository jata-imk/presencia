import type { RefObject } from "react";
import type { PublicationCardDto } from "@presencia/shared";
import { cardPreviewText } from "../cards/card-text.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { formatTime, zonedFromIso } from "../../lib/calendar/tz.js";

// El fantasma que sigue al cursor durante el arrastre.
//
// `pointer-events-none` no es cosmético: el motor del gesto resuelve la celda
// de destino con elementFromPoint, y si el fantasma interceptara el puntero
// esa consulta se devolvería a sí misma en vez de la grilla de abajo.
//
// La posición la escribe use-drag-schedule directo sobre este nodo; acá no
// hay ni una clase de transform, a propósito: dos escritores sobre la misma
// propiedad es lo que el addendum de ADR-014 prohíbe.

export function DragGhost({
  card,
  ghostRef,
  timeZone,
  blocked,
}: {
  card: PublicationCardDto;
  ghostRef: RefObject<HTMLDivElement | null>;
  timeZone: string;
  blocked: boolean;
}) {
  const meta = NETWORK_META[card.network];
  const time = card.scheduledAt ? formatTime(zonedFromIso(card.scheduledAt, timeZone)) : null;

  return (
    <div
      ref={ghostRef}
      aria-hidden
      className={`pointer-events-none fixed top-0 left-0 z-50 w-[196px] rounded-xl border bg-card px-2.5 py-2 shadow-lg ${
        blocked ? "border-warning-border" : "border-ai-border"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <meta.Logo size={13} />
        <span className="font-display text-[11px] font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span
          className={`ml-auto rounded-full px-1.5 font-display text-[10px] font-bold ${
            time ? "bg-secondary text-accent" : "bg-ai-bg text-accent"
          }`}
        >
          {time ?? "Sin hora"}
        </span>
      </div>
      <p className="line-clamp-2 text-[11.5px] leading-snug text-fg-secondary">
        {cardPreviewText(card.content)}
      </p>
    </div>
  );
}
