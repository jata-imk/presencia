import { FloatingFocusManager, FloatingOverlay, FloatingPortal } from "@floating-ui/react";
import type { ReactNode, RefObject } from "react";
import { useDialog } from "../../lib/floating/use-dialog.js";

// Shell genérico de diálogo modal (Mover a carpeta, Eliminar, Nueva
// carpeta, cuota agotada) — antes tenía ~25 líneas de trampa de foco
// escritas a mano (Tab/Shift+Tab, querySelectorAll de elementos
// focuseables); ahora ese motor vive en lib/floating/use-dialog.ts +
// FloatingFocusManager. Mismo contrato externo (labelledBy/maxWidth/
// children/onClose) — QuotaExhaustedModal y los tres Modal*.tsx de F6 PR8
// no cambian cómo lo usan, solo lo que hay adentro.
export function Modal({
  onClose,
  labelledBy,
  maxWidth = "max-w-sm",
  align = "center",
  initialFocus,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  maxWidth?: string;
  /** "top" para la paleta ⌘K: una lista larga centrada salta al crecer. */
  align?: "center" | "top";
  /**
   * Qué enfocar al abrir. Por defecto FloatingFocusManager elige el primer
   * tabbable, que sirve para los diálogos de confirmación. La paleta ⌘K lo
   * necesita explícito: sus opciones están fuera del tab order (combobox
   * con aria-activedescendant), así que sin esto el foco cae en el
   * contenedor y el input no recibe lo que el usuario teclea.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const { refs, context } = useDialog({ onClose });

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className={`fixed inset-0 z-50 flex justify-center bg-overlay p-4 ${
          align === "top" ? "items-start pt-[12vh]" : "items-center"
        }`}
      >
        <FloatingFocusManager context={context} initialFocus={initialFocus}>
          <div
            ref={refs.setFloating}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={`w-full ${maxWidth} rounded-2xl border border-line bg-card p-6 shadow-lg outline-none`}
          >
            {children}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
