import { useState } from "react";
import { BarChart2, Clock, ExternalLink, Eye, MessageSquare, XCircle } from "lucide-react";
import type { PublicationCardDto } from "@presencia/shared";
import { PublicationCardView } from "../cards/PublicationCardView.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Modal } from "../ui/Modal.js";
import type { DayCardActions } from "./DayPanelCard.js";

// Modal "Ver" (presencia-calendario.md §3). Foco temporal sobre UNA
// publicación: se abre, se lee, se cierra. Por eso es modal centrado y no
// otro panel — el panel del día es exploratorio y persistente, esto no.
//
// Reutiliza PublicationCardView, el mismo componente que pinta la card en
// Chat. Una "vista resumen" propia sería el mismo componente dos veces.

const FOOTER_BUTTON =
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-display text-[13px] font-semibold transition-colors";

export function CardModal({
  cards,
  actions,
  onClose,
}: {
  /** Una card, o las N redes del grupo multi-red. */
  cards: PublicationCardDto[];
  actions: DayCardActions;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(cards[0]?.id);
  const active = cards.find((card) => card.id === activeId) ?? cards[0];
  if (!active) return null;

  const canAct = active.status === "scheduled" || active.status === "failed";

  // Toda acción cierra el modal primero. No es cosmético: Modal monta un
  // FloatingOverlay z-50 con lockScroll y trampa de foco, mientras que el
  // panel de escritorio del ScheduleDrawer es un hermano flex in-flow sin
  // z-index (ADR-014). Con el modal abierto, el drawer se montaba DETRÁS
  // del velo: visible, inalcanzable y fuera del foco. Lo mismo con el toast
  // de "Deshacer" al cancelar, que quedaba tapado por el overlay.
  const act = (run: () => void) => () => {
    onClose();
    run();
  };

  return (
    <Modal onClose={onClose} labelledBy="card-modal-title" maxWidth="max-w-[680px]">
      <div className="-m-6 flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3.5">
          <Eye size={15} strokeWidth={1.75} className="text-fg-muted" />
          <h2 id="card-modal-title" className="font-display text-sm font-bold text-fg">
            Ver publicación
            {cards.length > 1 && ` · ${String(cards.length)} redes`}
          </h2>
        </div>

        {/* Selector de redes del grupo: cada red tiene su texto adaptado y
            sus hashtags. Poder comparar sin cerrar y abrir tres modales es
            la razón de que exista (§4). */}
        {cards.length > 1 && (
          <div
            role="tablist"
            aria-label="Redes de la publicación"
            className="flex shrink-0 gap-1 border-b border-line px-4 py-2"
          >
            {cards.map((card) => {
              const meta = NETWORK_META[card.network];
              const isActive = card.id === active.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveId(card.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs font-semibold transition-colors ${
                    isActive ? "bg-secondary text-brand" : "text-fg-secondary hover:bg-secondary"
                  }`}
                >
                  <meta.Logo size={13} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-app p-4">
          <PublicationCardView
            content={active.content}
            network={active.network}
            status={active.status}
            scheduledAt={active.scheduledAt}
            publishedAt={active.publishedAt}
            errorMessage={active.errorMessage}
            showCalendarLink={false}
            glow={false}
          />
        </div>

        {/* Las acciones cambian con el estado de la red ACTIVA, no del
            grupo: en un grupo mixto una puede estar publicada y otra
            programada, y ofrecer "Cancelar" sobre la publicada mentiría. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
          {canAct && (
            <button
              type="button"
              onClick={act(() => actions.onReschedule([active]))}
              className={`${FOOTER_BUTTON} bg-primary text-primary-fg shadow-sm hover:bg-primary-hover`}
            >
              <Clock size={15} strokeWidth={1.9} />
              Reprogramar
            </button>
          )}
          <button
            type="button"
            onClick={act(() => actions.onEditInChat(active))}
            disabled={active.chatId === null}
            title={active.chatId === null ? "El chat que la originó ya no existe" : undefined}
            className={`${FOOTER_BUTTON} border-[1.5px] border-line bg-card text-fg-secondary hover:border-line-focus hover:bg-secondary hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line disabled:hover:bg-card disabled:hover:text-fg-secondary`}
          >
            <MessageSquare size={15} strokeWidth={1.9} />
            Editar en Chat
          </button>
          {active.status === "published" && (
            <>
              <button
                type="button"
                disabled
                title="Analíticas llega en una fase posterior"
                className={`${FOOTER_BUTTON} cursor-not-allowed border-[1.5px] border-line bg-card text-fg-muted opacity-60`}
              >
                <BarChart2 size={15} strokeWidth={1.9} />
                Ver estadísticas
              </button>
              {/* Deshabilitado por una razón concreta, no por diseño: F6 no
                  persiste el id del post en la red (reconcileDueCards y
                  markPublished solo guardan publishedAt), así que no hay a
                  dónde llevar al usuario. Deuda de F6. */}
              <button
                type="button"
                disabled
                title="Todavía no guardamos el enlace al post publicado"
                className={`${FOOTER_BUTTON} cursor-not-allowed border-[1.5px] border-line bg-card text-fg-muted opacity-60`}
              >
                <ExternalLink size={15} strokeWidth={1.9} />
                Ver en la red
              </button>
            </>
          )}
          <div className="flex-1" />
          {canAct && (
            <button
              type="button"
              onClick={act(() => actions.onCancel([active]))}
              className={`${FOOTER_BUTTON} text-error hover:bg-error-bg`}
            >
              <XCircle size={15} strokeWidth={1.9} />
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${FOOTER_BUTTON} text-fg-muted hover:bg-secondary hover:text-brand`}
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
