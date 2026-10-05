import { FloatingFocusManager, FloatingOverlay, FloatingPortal } from "@floating-ui/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { assetContentUrl } from "@presencia/shared";
import { useDialog } from "../../lib/floating/use-dialog.js";

// Visor a pantalla completa (F10.6.1): ver una imagen en grande sin salir del
// panel. Sirve igual para un carrusel (con flechas para recorrerlo) que para
// una imagen suelta, y está pensado para Biblioteca (F12): recibe la lista de
// imágenes, no una card.
//
// Las flechas NAVEGAN, nunca reordenan (recorrido de F10.6: unas flechas que
// reordenaban en el detalle del slide se leían como "ver la siguiente").
// Esc cierra, ← → recorren, el foco queda atrapado adentro y vuelve al botón
// que lo abrió al cerrar (FloatingFocusManager).

export interface ViewerItem {
  assetId: string;
  alt: string;
  /** Lo que se lee arriba: "Portada", "Slide 3"… */
  label?: string;
}

export function ImageViewer({
  items,
  startIndex = 0,
  onClose,
}: {
  items: ViewerItem[];
  startIndex?: number;
  onClose: () => void;
}) {
  const { refs, context, getFloatingProps } = useDialog({ onClose });
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), items.length - 1));
  const item = items[index];
  const many = items.length > 1;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (!item) return null;
  const title = item.label ?? "Imagen";

  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll className="z-50 bg-viewer">
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            aria-label={`${title}${many ? `, ${String(index + 1)} de ${String(items.length)}` : ""}`}
            aria-modal="true"
            className="flex size-full flex-col outline-none"
          >
            <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-on-viewer">
              <span className="font-display text-sm font-semibold">{title}</span>
              {many && (
                <span className="rounded-full bg-on-viewer-faint px-2 py-0.5 text-xs font-semibold">
                  {index + 1} / {items.length}
                </span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="flex size-9 items-center justify-center rounded-full text-on-viewer hover:bg-on-viewer-soft"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            {/* Clic en el fondo cierra; en la imagen, no. */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16"
              onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
              }}
            >
              <img
                key={item.assetId}
                src={assetContentUrl(item.assetId)}
                alt={item.alt}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
              {many && index > 0 && <ViewerArrow side="left" onClick={() => setIndex(index - 1)} />}
              {many && index < items.length - 1 && (
                <ViewerArrow side="right" onClick={() => setIndex(index + 1)} />
              )}
            </div>

            {many && (
              <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-4">
                {items.map((thumb, i) => (
                  <button
                    key={thumb.assetId + String(i)}
                    type="button"
                    aria-label={`Ver ${thumb.label ?? `imagen ${String(i + 1)}`}`}
                    aria-current={i === index}
                    onClick={() => setIndex(i)}
                    className={`size-12 shrink-0 overflow-hidden rounded-md transition-opacity ${
                      i === index ? "ring-2 ring-on-viewer" : "opacity-55 hover:opacity-90"
                    }`}
                  >
                    <img
                      src={assetContentUrl(thumb.assetId)}
                      alt=""
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

function ViewerArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Imagen anterior" : "Imagen siguiente"}
      onClick={onClick}
      className={`absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-on-viewer-faint text-on-viewer backdrop-blur-sm hover:bg-on-viewer-soft ${
        side === "left" ? "left-3 sm:left-5" : "right-3 sm:right-5"
      }`}
    >
      <Icon size={22} aria-hidden />
    </button>
  );
}
