import { AlertTriangle, Calendar, PanelRight, X } from "lucide-react";
import { useEffect } from "react";
import type { SocialNetwork } from "@presencia/shared";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useCardSelectionStore, useSelectedIds } from "../../stores/card-selection-store.js";
import { useCardsByIds } from "../../stores/cards-store.js";
import { usePublicationPanelStore } from "../../stores/publication-panel-store.js";
import { useScheduleDrawerStore } from "../../stores/schedule-drawer-store.js";

// La barra de la selección multired (F10.5 PR5, Chat Rediseño.html → 7.1):
// flota sobre el composer mientras haya cards marcadas. "Ver juntas" las abre
// como pestañas del panel; "Programar juntas" abre el drawer de siempre en
// modo grupo. Al programarlas, la API les da un grupo común (ADR-018,
// addendum F10.5): en el calendario se ven juntas aunque nacieran en turnos
// distintos.
export function SelectionBar({ chatId }: { chatId: string }) {
  const ids = useSelectedIds(chatId);
  const cards = useCardsByIds(ids);
  const clear = useCardSelectionStore((s) => s.clear);
  const openPanel = usePublicationPanelStore((s) => s.open);
  const openDrawer = useScheduleDrawerStore((s) => s.open);

  // La selección es de este chat: al salir de él se olvida.
  useEffect(() => () => clear(), [chatId, clear]);

  // Esc deshace la selección antes que cerrar el panel: se escucha en captura
  // y se marca como atendida (el panel ignora las que ya lo están).
  useEffect(() => {
    if (ids.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      e.preventDefault();
      clear();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ids.length, clear]);

  if (ids.length === 0) return null;

  // Dos publicaciones de la misma red saldrían por la misma cuenta, casi
  // seguro con horarios cercanos: vale la pena avisar antes de programarlas.
  const counts = new Map<SocialNetwork, number>();
  for (const card of cards) counts.set(card.network, (counts.get(card.network) ?? 0) + 1);
  const repeated = [...counts.entries()].find(([, n]) => n > 1);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[112px] z-10 flex flex-col items-center gap-2 px-4">
      {repeated && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          Hay {repeated[1]} publicaciones para {NETWORK_LABELS[repeated[0]]}: se publicarían en la
          misma cuenta.
        </div>
      )}
      <div
        role="toolbar"
        aria-label="Cards seleccionadas"
        className="pointer-events-auto flex items-center gap-1 rounded-xl bg-fg p-1.5 text-fg-inverse shadow-xl"
      >
        <span className="px-2.5 font-display text-[13px] font-semibold whitespace-nowrap">
          {ids.length} {ids.length === 1 ? "seleccionada" : "seleccionadas"}
        </span>
        <span aria-hidden="true" className="h-5 w-px bg-fg-inverse-faint" />
        <button
          type="button"
          onClick={() => openPanel(chatId, ids, ids[0])}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-display text-xs font-semibold whitespace-nowrap hover:bg-fg-inverse-faint"
        >
          <PanelRight size={14} aria-hidden="true" />
          Ver juntas
        </button>
        <button
          type="button"
          onClick={() => {
            openDrawer(cards);
            clear();
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent-cta px-2.5 font-display text-xs font-semibold whitespace-nowrap text-accent-cta-fg"
        >
          <Calendar size={14} aria-hidden="true" />
          Programar juntas
        </button>
        <button
          type="button"
          onClick={clear}
          aria-label="Salir de la selección (Esc)"
          title="Salir de la selección (Esc)"
          className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-fg-inverse-faint"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
