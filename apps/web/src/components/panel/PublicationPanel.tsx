import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { backdropFade, sheetRight } from "../../lib/motion.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import {
  PANEL_WIDTH_MIN_PX,
  usePublicationPanelStore,
} from "../../stores/publication-panel-store.js";
import { useScheduleDrawerStore } from "../../stores/schedule-drawer-store.js";
import { useSidebarStore } from "../../stores/sidebar-store.js";
import { PanelCard } from "./PanelCard.js";

// El panel de publicación (F10.5, Chat Rediseño.html → Split/Panel). Tres
// formas según el ancho, decididas en el diseño (nota "Ancho del panel" y
// "768 px"):
//
// - ≥1024: hermano flex del chat, como el drawer de programar (ADR-014: el
//   drawer de escritorio empuja, no tapa). Mientras está abierto el sidebar
//   se encoge a riel para que el chat conserve su ancho de lectura. El handle
//   de la izquierda ajusta el ancho y se recuerda.
// - 768–1023: no caben chat y panel sin romper la lectura, así que entra como
//   drawer de 520 px encima del chat, con scrim. Esc o tocar el scrim cierran.
// - <768: pantalla completa, con "← Chat" para volver.
//
// Mientras el drawer de programar está abierto, el panel se hace a un lado
// (sin perder sus pestañas): los dos empujando dejarían al chat sin ancho.
export function PublicationPanel({
  chatId,
  onAdapt,
}: {
  chatId: string;
  /** "Adaptar a otra red": precarga el composer del chat (flujo 1, card nueva). */
  onAdapt: (text: string) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  const activeId = usePublicationPanelStore((s) => s.activeId);
  const panelChatId = usePublicationPanelStore((s) => s.chatId);
  const width = usePublicationPanelStore((s) => s.width);
  const close = usePublicationPanelStore((s) => s.close);
  const reset = usePublicationPanelStore((s) => s.reset);
  const drawerOpen = useScheduleDrawerStore((s) => s.cardIds !== null);
  const setForcedCollapsed = useSidebarStore((s) => s.setForcedCollapsed);

  const open = activeId !== null && panelChatId === chatId;
  const visible = open && !drawerOpen;

  // Las pestañas son de este chat: al salir de él el panel se va con él.
  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    if (!visible || !isDesktop) return;
    setForcedCollapsed(true);
    return () => setForcedCollapsed(false);
  }, [visible, isDesktop, setForcedCollapsed]);

  // Esc cierra el panel, salvo que algo encima (un modal, un menú) ya se haya
  // quedado con la tecla.
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  if (isDesktop) {
    if (!visible) return null;
    return (
      <>
        <ResizeHandle />
        <div
          data-publication-panel=""
          className="flex h-full shrink-0 flex-col"
          style={{
            width: `${String(width * 100)}%`,
            minWidth: PANEL_WIDTH_MIN_PX,
          }}
        >
          <PanelCard onAdapt={onAdapt} />
        </div>
      </>
    );
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          {isTablet && (
            <motion.div
              key="scrim"
              variants={backdropFade}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={close}
              aria-hidden="true"
              className="absolute inset-0 z-20 bg-overlay"
            />
          )}
          <motion.div
            key="panel"
            data-publication-panel=""
            variants={sheetRight}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={
              isTablet
                ? "absolute inset-y-0 right-0 z-30 flex w-[520px] max-w-full flex-col shadow-xl"
                : "fixed inset-0 z-40 flex flex-col"
            }
          >
            <PanelCard onAdapt={onAdapt} mobile={!isTablet} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * El borde entre chat y panel, arrastrable. Calcula la fracción contra el
 * contenedor de los dos (su padre), no contra la ventana: el sidebar ocupa
 * su parte y no debe contar.
 */
function ResizeHandle() {
  const setWidth = usePublicationPanelStore((s) => s.setWidth);
  const width = usePublicationPanelStore((s) => s.width);
  const ref = useRef<HTMLDivElement>(null);

  function fractionAt(clientX: number): number | null {
    const row = ref.current?.parentElement;
    if (!row) return null;
    const box = row.getBoundingClientRect();
    return (box.right - clientX) / box.width;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.dataset.resizing = "true";
    const move = (ev: PointerEvent) => {
      const f = fractionAt(ev.clientX);
      if (f !== null) setWidth(f);
    };
    const up = () => {
      delete document.body.dataset.resizing;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del panel"
      aria-valuenow={Math.round(width * 100)}
      aria-valuemin={20}
      aria-valuemax={60}
      tabIndex={0}
      title="Arrastra para cambiar el ancho"
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setWidth(width + 0.02);
        if (e.key === "ArrowRight") setWidth(width - 0.02);
      }}
      className="group relative w-[7px] shrink-0 cursor-col-resize bg-app outline-none"
    >
      <span className="absolute inset-y-0 left-[3px] w-px bg-line" />
      <span className="absolute top-1/2 left-px h-9 w-[5px] -translate-y-1/2 rounded-full bg-line transition-colors group-hover:bg-line-focus group-focus-visible:bg-line-focus" />
    </div>
  );
}
