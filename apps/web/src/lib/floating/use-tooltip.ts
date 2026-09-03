import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { useMemo, useState } from "react";

// Motor de un tooltip — la cuarta clase de flotante del repo, después de
// Menu, Dialog e Inspector (ADR-015). Se justifica por lo mismo que las
// otras: no encaja en ninguna. No es Menu (no se abre con click ni tiene
// items navegables), no es Dialog (no bloquea nada) y no es Inspector (no
// vive abierto ni se cierra con Escape a mano) — se abre solo al apuntar o
// al enfocar, y desaparece igual de solo.
//
// Reemplaza al atributo `title` nativo, que no se puede estilar, tarda
// ~1s en aparecer, no responde al foco de teclado en varios navegadores y
// desaparece a los pocos segundos aunque el puntero siga encima.
//
// Sin flecha: no se usa el middleware `arrow` de floating-ui. Un globito
// pegado al elemento ya dice de quién habla, y la flecha obliga a un nodo
// extra que hay que reposicionar en cada flip.
export function useTooltip({ placement = "top" }: { placement?: Placement } = {}) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    // transform:false -> floatingStyles posiciona con `top`/`left` reales en
    // vez de un `transform: translate(x, y)`. Es obligatorio aca porque el
    // globito entra con una animacion de motion, y motion escribe SU propio
    // transform sobre el mismo nodo: pisaba el de floating-ui y el tooltip
    // aparecia pegado en 0,0 en vez de junto a su ancla. Menu no lo necesita
    // porque no anima nada.
    transform: false,
    // Mismo trío que use-menu, con menos separación: un tooltip se lee como
    // parte del elemento, no como una superficie aparte.
    middleware: useMemo(() => [offset(6), flip(), shift({ padding: 8 })], []),
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    // delay asimétrico: 400ms para abrir (mover el puntero por encima de
    // media pantalla no debe ir dejando globitos a su paso) y 100ms para
    // cerrar (pasar de un botón al de al lado se lee como un solo gesto).
    // `move: false` no reabre por mover el puntero dentro del mismo
    // elemento — sin eso, un mousemove sobre un botón ancho lo reinicia.
    useHover(context, { move: false, delay: { open: 400, close: 100 } }),
    // El foco de teclado abre sin delay: quien tabula ya eligió el
    // elemento, no está de paso.
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: "tooltip" }),
  ]);

  return { open, refs, floatingStyles, context, getReferenceProps, getFloatingProps };
}

export type UseTooltipReturn = ReturnType<typeof useTooltip>;
