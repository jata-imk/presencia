import { FloatingPortal, useMergeRefs, type Placement } from "@floating-ui/react";
import { cloneElement, isValidElement, type ReactElement, type ReactNode, type Ref } from "react";
import { motion } from "motion/react";
import { useTooltip } from "../../lib/floating/use-tooltip.js";

// Globito de ayuda. Envuelve a UN hijo y le cuelga el tooltip:
//
//   <Tooltip label="Ir a hoy (T)">
//     <button type="button">Hoy</button>
//   </Tooltip>
//
// API de envoltura y no compuesta como `Menu`: los 28 casos de la app son
// "un elemento, un texto", así que Trigger/Content sería ceremonia sin
// ganancia. El motor vive en lib/floating/use-tooltip.ts; este archivo es
// solo la piel (ADR-015: los consumidores dependen de <Tooltip>, no de
// floating-ui).
//
// Un tooltip NUNCA es la única fuente de una etiqueta: en táctil no hay
// hover y el globito no existe. Donde el `title` era lo único que nombraba
// un control (los iconos del sidebar), el `aria-label` se queda puesto.

const TOOLTIP_CLASS =
  "pointer-events-none z-50 max-w-[260px] rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] leading-snug text-fg shadow-lg";

interface TriggerProps {
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * Clases de LAYOUT que el hijo le presta al `<span>` ancla de la variante
 * deshabilitada. Sin esto el span —que es shrink-to-fit— se mete entre el
 * contenedor flex y el botón, y las clases que hablaban con el padre dejan
 * de aplicar: el botón "Crear para este día" pasaba de ancho completo a
 * ancho de contenido, y los `shrink-0` dejaban de proteger a los botones de
 * la barra de la card. Se copian, no se mueven: el botón las sigue
 * necesitando contra el span.
 */
const LAYOUT_CLASSES = /(?:^|\s)(w-full|h-full|flex-1|grow|shrink-0|self-[a-z]+|min-w-0)(?=\s|$)/g;

function layoutOf(className: string | undefined): string {
  if (!className) return "";
  return [...className.matchAll(LAYOUT_CLASSES)].map(([, cls]) => cls).join(" ");
}

export function Tooltip({
  label,
  children,
  placement = "top",
}: {
  /** Vacío o nulo apaga el tooltip — así el caller no necesita ternarios. */
  label?: ReactNode;
  children: ReactElement<TriggerProps>;
  placement?: Placement;
}) {
  const { open, refs, floatingStyles, getReferenceProps, getFloatingProps } = useTooltip({
    placement,
  });

  // Los hooks van antes del early return (reglas de hooks); el ref del hijo
  // se fusiona con el nuestro para no pisarlo si ya tenía uno.
  const childRef = isValidElement(children) ? children.props.ref : undefined;
  const mergedRef = useMergeRefs([refs.setReference, childRef ?? null]);

  if (!label) return children;

  // Un <button disabled> no emite eventos de puntero, y justo los tooltips
  // que más falta hacen cuelgan de botones apagados ("Próximamente", "Ver
  // en la red"). Para esos, el ancla es un <span> que sí los recibe.
  const trigger = children.props.disabled ? (
    // Sin tabIndex a propósito: un control deshabilitado ya está fuera del
    // orden de tabulación, y darle uno al ancla creaba paradas de teclado
    // mudas (tres seguidas en el Composer). El globito de un control
    // apagado se alcanza apuntando, que es como se descubre.
    <span
      ref={refs.setReference}
      className={`inline-flex ${layoutOf(children.props.className)}`}
      {...getReferenceProps()}
    >
      {children}
    </span>
  ) : (
    cloneElement(children, {
      ref: mergedRef,
      // Los props del hijo van adentro para que floating-ui FUSIONE sus
      // handlers con los del tooltip. Sin esto, un onPointerEnter propio
      // del hijo quedaba pisado en silencio.
      ...getReferenceProps(children.props),
    } as Partial<TriggerProps>)
  );

  return (
    <>
      {trigger}
      {open && (
        <FloatingPortal>
          {/* Sin FloatingFocusManager: un tooltip no recibe foco nunca — el
              foco se queda donde estaba y el globito solo lo describe
              (useRole pone aria-describedby en el ancla).
              z-50 acá y no en cada caller, por el mismo motivo que Menu:
              el portal cuelga de <body> con z-index auto y cualquier
              elemento posicionado lo taparía.
              pointer-events-none: si el globito capturara el puntero al
              aparecer bajo el cursor, se dispararía su propio mouseleave y
              parpadearía. */}
          <motion.div
            ref={refs.setFloating}
            style={floatingStyles}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={TOOLTIP_CLASS}
            {...getFloatingProps()}
          >
            {label}
          </motion.div>
        </FloatingPortal>
      )}
    </>
  );
}
