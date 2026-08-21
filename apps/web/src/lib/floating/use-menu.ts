import { useEffect, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  type Placement,
} from "@floating-ui/react";

// Motor de posición/interacción de un menú flotante (···, avatar, etc) —
// sin opinión de estilo, ese vive en components/ui/Menu.tsx. No-modal a
// propósito: el fondo sigue interactivo mientras el menú está abierto
// (ver el plan — Menu vs Dialog se distinguen por eso, no por si tienen
// portal). Reemplaza el patrón `useState + onBlurCapture + top-full` que
// se había copiado a mano en ChatOptionsMenu.tsx y Topbar.tsx — ninguno de
// los dos manejaba colisión con el viewport ni escapaba el overflow de su
// contenedor (el bug real que originó esto: un menú se cortaba contra el
// scroll del sidebar).
export function useMenu({ placement = "bottom-end" }: { placement?: Placement } = {}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    // offset primero (separa del trigger), flip cuando no cabe en la
    // dirección preferida, shift para el eje cruzado — así se soluciona
    // el corte contra bordes sin medir nada a mano.
    middleware: useMemo(() => [offset(4), flip(), shift({ padding: 8 })], []),
    whileElementsMounted: autoUpdate,
  });

  // useClick+useDismiss en vez de onClick a mano + onBlurCapture: dismiss
  // detecta pointerdown fuera de verdad (no depende de que lo clickeado
  // sea focuseable, a diferencia de blur) — la clase de bug que el click
  // intermitente del onBlurCapture original tenía.
  // Menu.tsx's MenuItem.setRef solo agrega al array en el mount (no quita
  // nada en el unmount — code review 2026-08-20). Como MenuContent
  // desmonta TODOS los items de golpe al cerrar (`if (!open) return null`),
  // sin este reset listRef.current se queda con nodos ya desmontados; al
  // reabrir, los items nuevos calculan su índice como
  // `listRef.current.length` sobre ese array sucio en vez de arrancar en
  // 0 — la navegación con flechas (useListNavigation lee este mismo
  // listRef) se corrompe después del primer cierre/apertura, en cualquier
  // instancia de Menu de la app.
  useEffect(() => {
    if (!open) listRef.current = [];
  }, [open]);

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: setActiveIndex,
    }),
  ]);

  return {
    open,
    setOpen,
    refs,
    floatingStyles,
    context,
    listRef,
    activeIndex,
    setActiveIndex,
    getReferenceProps,
    getFloatingProps,
    getItemProps,
  };
}

export type UseMenuReturn = ReturnType<typeof useMenu>;
