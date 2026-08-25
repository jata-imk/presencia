import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import type { PublicationCardDto } from "@presencia/shared";
import { cardPreviewText } from "../cards/card-text.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";

// Bandeja de borradores (presencia-calendario.md §3): lo que se creó en Chat
// y todavía no tiene fecha.
//
// A la IZQUIERDA y no a la derecha por dirección de lectura: la izquierda es
// el origen mental (de dónde vienen las cosas) y el calendario es el destino.
// Arrastrar de acá a un día es el flujo más común del módulo.
//
// Es una región hermana de la grilla, con su propio scroll — permitido por el
// addendum de ADR-014 ("un eje vertical por región", no por pantalla).

export function DraftsPanel({
  drafts,
  collapsed,
  onToggle,
  onStartDrag,
  draggingId,
}: {
  drafts: PublicationCardDto[];
  collapsed: boolean;
  onToggle: () => void;
  /** Ausente en pantallas táctiles: ahí no hay arrastre (ver calendario.tsx). */
  onStartDrag?: (event: React.PointerEvent, card: PublicationCardDto) => void;
  draggingId: string | null;
}) {
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-line bg-card py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Mostrar los borradores"
          aria-expanded={false}
          className="flex size-9 items-center justify-center rounded-lg bg-secondary text-brand transition-colors hover:bg-secondary-hover"
        >
          <PanelLeftOpen size={17} strokeWidth={1.75} />
        </button>
        {drafts.length > 0 && (
          <span className="rounded-full bg-accent-cta px-1.5 py-0.5 font-display text-[10px] font-bold text-brand">
            {drafts.length}
          </span>
        )}
        {/* Vertical para que el rail siga diciendo qué es sin ocupar ancho. */}
        <span
          className="font-display text-[13px] font-bold tracking-wide text-fg-secondary"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Borradores
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="flex-1 font-display text-sm font-bold text-fg">
          Borradores <span className="text-accent">({drafts.length})</span>
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Ocultar los borradores"
          aria-expanded
          className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary hover:text-brand"
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
      </div>

      <p className="flex shrink-0 items-center gap-1.5 px-4 py-2 text-[11px] text-fg-muted">
        <Sparkles size={12} strokeWidth={1.75} className="shrink-0 text-ai" />
        {drafts.length === 0
          ? "Creados en Chat, sin fecha programada"
          : onStartDrag
            ? "Arrastra uno a un día para programarlo"
            : "Creados en Chat, sin fecha programada"}
      </p>

      {drafts.length === 0 ? (
        <p className="px-4 pt-2 text-[13px] leading-relaxed text-fg-secondary">
          No tienes borradores sin fecha. Los que crees en Chat y no programes van a aparecer aquí.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-1 pb-4">
          {drafts.map((card) => {
            const meta = NETWORK_META[card.network];
            const lifted = card.id === draggingId;
            return (
              <article
                key={card.id}
                // touch-action: sin esto, en una pantalla táctil el navegador
                // se queda el gesto para hacer scroll y el pointermove nunca
                // llega. En desktop no cambia nada.
                // touchAction solo cuando hay arrastre: en táctil dejaría
                // la lista sin scroll, porque todo deslizamiento vertical
                // que empiece sobre una tarjeta se lo comería el gesto.
                style={onStartDrag ? { touchAction: "none" } : undefined}
                onPointerDown={onStartDrag ? (event) => onStartDrag(event, card) : undefined}
                className={`rounded-xl border border-ai-border bg-ai-bg px-3 py-2.5 transition-opacity ${
                  onStartDrag ? "cursor-grab active:cursor-grabbing" : ""
                } ${lifted ? "opacity-40" : ""}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <meta.Logo size={13} />
                  <span
                    className="font-display text-[11px] font-semibold"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="ml-auto rounded-full border border-ai-border px-2 font-display text-[9.5px] font-bold text-accent">
                    Borrador
                  </span>
                </div>
                <p className="line-clamp-2 text-[12px] leading-relaxed text-cal-draft-fg">
                  {cardPreviewText(card.content)}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}
