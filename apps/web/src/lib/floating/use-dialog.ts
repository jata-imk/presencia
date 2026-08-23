import { useFloating, useDismiss, useInteractions, useRole } from "@floating-ui/react";

// Motor de un diálogo modal (Mover a carpeta, Eliminar, Nueva carpeta,
// cuota agotada) — sin opinión de estilo, esa vive en components/ui/Modal.tsx.
// A diferencia de useMenu (lib/floating/use-menu.ts) no hay middleware de
// colisión ni useClick: un diálogo siempre se centra en el viewport y no
// tiene trigger propio — quien lo monta decide "abierto" desde afuera
// (el componente solo existe mientras {showX && <Modal.../>}), acá solo
// se resuelve cómo se cierra: Escape, o click en el overlay (outsidePress
// detecta el click fuera del contenido del diálogo — el overlay ocupa
// exactamente esa área).
export function useDialog({ onClose }: { onClose: () => void }) {
  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: "mousedown" }),
    useRole(context, { role: "dialog" }),
  ]);

  return { refs, context, getFloatingProps };
}
