import { useRef } from "react";
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  applySidebarWidth,
  clampSidebarWidth,
  useSidebarStore,
} from "../../stores/sidebar-store.js";

// Separador arrastrable del sidebar (F6.5 PR1, patrón WAI-ARIA de window
// splitter — el soporte de teclado no es un extra, es lo que lo hace
// operable sin mouse).
//
// ADR-014 addendum: esto NO usa motion. Un gesto pointer-driven no puede
// tener duración ni curva — cualquier easing lo haría lagear detrás del
// dedo. Durante el arrastre se escribe la variable CSS directo en <html>
// (applySidebarWidth) sin pasar por React: cero renders por pointermove, y
// ningún re-render del sidebar puede pisar el ancho a mitad del gesto.
// Recién al soltar se commitea al store, que persiste.

/** Techo dinámico: en una ventana angosta, 320px de sidebar dejan el contenido sin lugar. */
function maxForViewport(): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.round(window.innerWidth * 0.4));
}

export function SidebarResizeHandle() {
  const width = useSidebarStore((s) => s.width);
  const setWidth = useSidebarStore((s) => s.setWidth);
  const latest = useRef(width);

  function commit(px: number) {
    const next = Math.min(clampSidebarWidth(px), maxForViewport());
    latest.current = next;
    applySidebarWidth(next);
    setWidth(next);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    // Del store, no de getBoundingClientRect(): leer layout dentro del
    // gesto fuerza un reflow síncrono por evento.
    const startWidth = width;
    const ceiling = maxForViewport();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.dataset.resizing = "true";

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(clampSidebarWidth(startWidth + (ev.clientX - startX)), ceiling);
      latest.current = next;
      applySidebarWidth(next);
    };
    const onEnd = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("lostpointercapture", onEnd);
      delete document.body.dataset.resizing;
      setWidth(latest.current);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("lostpointercapture", onEnd);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      commit(width - step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      commit(width + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      commit(SIDEBAR_WIDTH_MIN);
    } else if (e.key === "End") {
      e.preventDefault();
      commit(SIDEBAR_WIDTH_MAX);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del menú lateral"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      // touch-none es obligatorio: sin él, en tablet el arrastre lo captura
      // el scroll de la página en vez del handle. El área de golpe real es
      // el ::after de 9px (app.css), el div visible es de 1px.
      className="group absolute inset-y-0 -right-px z-10 w-px cursor-col-resize touch-none bg-transparent after:absolute after:inset-y-0 after:-left-1 after:w-[9px] after:content-[''] hover:bg-line-focus focus-visible:bg-line-focus"
    />
  );
}
