import { useEffect, useRef, useState } from "react";
import {
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";

// Motor de la paleta de comandos (⌘K). Comparte la técnica de use-menu.ts
// pero NO se puede reusar tal cual, y esa es la sutileza del componente:
//
// La paleta es un COMBOBOX, no un menú. El foco del DOM tiene que quedarse
// en el input mientras las flechas mueven la selección, o el usuario deja
// de poder escribir apenas toca ArrowDown. use-menu usa useListNavigation
// en modo no-virtual, que MUEVE el foco a cada item — acá se usa
// `virtual: true`, que en vez de mover el foco expone la selección con
// aria-activedescendant y deja el foco quieto en el input.
//
// De regalo, `virtual` trae el scroll-into-view del item activo; `loop`
// hace que la lista sea circular.
export function useCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { refs, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });

  // Mismo reset que use-menu.ts:54-56, por el mismo bug: los items se
  // registran en el array al montar y nadie los quita al desmontar, así
  // que sin esto la lista de la segunda apertura calcula sus índices sobre
  // nodos muertos y las flechas dejan de funcionar. Acá además la lista
  // cambia en cada tecleo, no solo al abrir/cerrar.
  useEffect(() => {
    if (!open) {
      listRef.current = [];
      setActiveIndex(null);
    }
  }, [open]);

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: "mousedown" }),
    useRole(context, { role: "listbox" }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: setActiveIndex,
      virtual: true,
      loop: true,
      focusItemOnOpen: false,
    }),
  ]);

  return {
    refs,
    context,
    listRef,
    activeIndex,
    setActiveIndex,
    getReferenceProps,
    getFloatingProps,
    getItemProps,
  };
}
