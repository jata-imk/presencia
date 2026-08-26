import { useDismiss, useFloating, useInteractions } from "@floating-ui/react";

// Motor de un panel INSPECTOR: flota sobre el contenido, se cierra con
// Escape o con un click afuera, y no bloquea nada detrás.
//
// Es un tercer caso, distinto de los dos de ADR-015. No es `Menu` (no cuelga
// de un trigger ni se posiciona contra él) y no es `Dialog` (no hay overlay,
// ni trampa de foco, ni aria-modal: la grilla de atrás se sigue leyendo y se
// sigue clickeando, que es justo lo que el panel del día necesita —
// oscurecerla contradiría su razón de existir).
//
// Sin `useRole`: `role="dialog"` le anunciaría al lector de pantalla un
// modal que no lo es. Quien lo monta pone su propio rol y etiqueta.
export function useInspector({
  onClose,
  ignoreOutsidePress,
  enabled = true,
}: {
  onClose: () => void;
  /**
   * `false` deja el hook montado pero inerte. Existe por las reglas de los
   * hooks: el panel del día abajo de 768px se renderiza como hoja modal
   * —que trae su propio dismiss— pero no puede *dejar de llamar* a este
   * hook. Sin apagarlo, useDismiss se queda con un floating element que
   * nunca se montó y trata CUALQUIER mousedown como click de afuera: tocar
   * una card adentro de la hoja la cerraba antes de que llegara el click.
   */
  enabled?: boolean;
  /**
   * Zonas cuyo click NO cierra el panel. Dos casos reales: clickear otro día
   * de la grilla debe CAMBIAR de día (sin esto el mousedown cierra y el
   * click siguiente reabre, con las dos animaciones enteras en el medio), y
   * clickear dentro de una superficie que el propio panel abrió —el drawer
   * de programación, el "Deshacer" del toast— no debe hacerlo desaparecer a
   * mitad del flujo. El menú ⋮ no necesita excepción: está en el árbol de
   * React del panel y useDismiss ya lo trata como "adentro".
   */
  ignoreOutsidePress?: (target: Element) => boolean;
}) {
  const { refs, context } = useFloating({
    open: enabled,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const { getFloatingProps } = useInteractions([
    useDismiss(context, {
      enabled,
      // Escape lo decide QUIEN monta el panel, no esta primitiva. useDismiss
      // pone su listener en `document`, igual que el del Modal, y
      // stopPropagation entre hermanos del mismo nodo no sirve: con un
      // diálogo abierto encima del panel, un solo Escape cerraba los dos y
      // dejaba al usuario en la grilla pelada.
      escapeKey: false,
      outsidePressEvent: "mousedown",
      outsidePress: (event) => {
        const target = event.target;
        if (ignoreOutsidePress && target instanceof Element) {
          return !ignoreOutsidePress(target);
        }
        return true;
      },
    }),
  ]);

  return { refs, getFloatingProps };
}
