import type { ReactNode } from "react";
import { motion } from "motion/react";
import {
  FloatingFocusManager,
  FloatingOverlay,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { backdropFade, sheetUp } from "../../lib/motion.js";

// Chrome compartido de las hojas inferiores del Calendario (panel del día y
// bandeja de borradores abajo de 768px).
//
// MODAL, a diferencia del inspector de escritorio: en un teléfono la hoja
// ocupa casi toda la pantalla, así que dejar el fondo "vivo" sería mentir.
// Backdrop + trampa de foco + lockScroll, igual que el bottom-sheet del
// ScheduleDrawer (ADR-014, addendum de ADR-015).
export function BottomSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  // Escape acá adentro y no en el handler global del Calendario: la hoja
  // atrapa el foco, así que el keydown nace dentro de un [role="dialog"] y
  // ese handler se retira a propósito (para no cerrar el panel por detrás de
  // un diálogo). Sin esto, con teclado la hoja no tenía salida.
  // outsidePress apagado: el backdrop ya cierra con su onClick y este
  // dismiss no ve el árbol de React de quien la monta.
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { escapeKey: true, outsidePress: false }),
  ]);

  return (
    <>
      <motion.div
        variants={backdropFade}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />
      <FloatingOverlay lockScroll className="z-50">
        <FloatingFocusManager context={context} modal>
          <motion.aside
            ref={refs.setFloating}
            {...getFloatingProps()}
            variants={sheetUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-card shadow-xl outline-none"
          >
            {/* Agarradera: no arrastra nada, dice "esto es una hoja". */}
            <span
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-focus"
            />
            {children}
          </motion.aside>
        </FloatingFocusManager>
      </FloatingOverlay>
    </>
  );
}
