import { FloatingFocusManager, FloatingPortal, type Placement } from "@floating-ui/react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { useMenu, type UseMenuReturn } from "../../lib/floating/use-menu.js";

// Menú flotante no-modal (···, avatar) — API compuesta porque los menús
// reales de la app mezclan botones con contenido condicional (el link de
// Configuración en Topbar, el error de "Archivar" en ChatOptionsMenu); un
// array de `items` no lo expresa limpio sin volverse compuesto por otro
// lado de todos modos. El motor (posición, portal, dismiss, navegación de
// teclado) vive en lib/floating/use-menu.ts — este archivo es solo la piel
// visual (Tailwind), sin tocar floating-ui directo fuera de acá y de
// use-menu.ts (DIP: los consumidores dependen de <Menu>, no de la librería).
const MenuContext = createContext<UseMenuReturn | null>(null);

function useMenuContext(): UseMenuReturn {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu.* debe usarse dentro de <Menu>");
  return ctx;
}

export function Menu({
  children,
  placement = "bottom-end",
}: {
  children: ReactNode;
  placement?: Placement;
}) {
  const menu = useMenu({ placement });
  return <MenuContext.Provider value={menu}>{children}</MenuContext.Provider>;
}

const MenuTrigger = memo(function MenuTrigger({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "onClick" | "ref"
>) {
  const { refs, open, getReferenceProps } = useMenuContext();
  return (
    <button
      type="button"
      ref={refs.setReference}
      aria-haspopup="menu"
      aria-expanded={open}
      className={className}
      {...rest}
      {...getReferenceProps()}
    >
      {children}
    </button>
  );
});

/**
 * El look estándar de un menú y de sus items. Vivían copiados literalmente
 * en ChatOptionsMenu y Topbar, y el tercer caller (el menú ⋮ del panel del
 * día, F7) iba a ser la tercera copia. `Menu` sigue sin imponer estilo
 * —quien quiera otro pasa su propio className—, esto es solo el default
 * compartido para no tener tres definiciones del mismo menú.
 */
export const MENU_CONTENT_CLASS =
  "w-52 rounded-xl border border-line bg-card p-1.5 shadow-lg outline-none";
export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:bg-secondary-hover data-[active]:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50";

function MenuContent({ children, className }: { children: ReactNode; className?: string }) {
  const { open, refs, floatingStyles, context, getFloatingProps } = useMenuContext();
  if (!open) return null;
  return (
    <FloatingPortal>
      {/* modal={false}: el fondo sigue interactivo — un menú no es un
          diálogo (ver el plan). initialFocus={-1} deja el foco DOM en el
          trigger; la navegación con flechas la maneja useListNavigation
          por estado (activeIndex), no por foco real, así el fondo nunca
          queda inerte. */}
      <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          role="menu"
          // z-50 acá y no en cada caller: es correctitud, no estilo. El menú
          // vive en un portal a nivel de <body> con z-index auto, así que
          // CUALQUIER elemento posicionado con z-index positivo lo tapa —
          // pasó de verdad con el panel del día del Calendario (z-20): el
          // menú abría, se leía en el DOM, y quedaba pintado detrás. Mismo
          // nivel que Modal y Toast; entre dos z-50 gana el que monta
          // después, que es siempre el flotante recién abierto.
          className={`z-50 ${className ?? MENU_CONTENT_CLASS}`}
          {...getFloatingProps()}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

function MenuItem({
  children,
  onClick,
  href,
  disabled,
  className,
  title,
  checked,
  keepOpen,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Renderiza un <Link> de react-router en vez de <button> — conserva
   *  abrir-en-pestaña-nueva/ctrl+click/click-medio, que un botón con
   *  navigate() a mano rompe. */
  href?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  /**
   * Convierte el item en `menuitemcheckbox`. Los filtros del Calendario son
   * casillas: marcar una no es "elegir y salir", y el menú tiene que seguir
   * abierto para marcar la siguiente y ver la grilla cambiar detrás.
   */
  checked?: boolean;
  /** No cerrar el menú al activar. Implícito cuando hay `checked`. */
  keepOpen?: boolean;
}) {
  const { listRef, activeIndex, setActiveIndex, getItemProps, setOpen } = useMenuContext();
  const indexRef = useRef(-1);
  const [index, setIndex] = useState(-1);

  // Cada Item se registra en el array compartido de listRef (useListNavigation
  // lo usa para saber a quién moverle el "activo" con las flechas) — el
  // índice se asigna una sola vez, en el orden en que React monta los
  // hijos (orden del DOM, que es el orden real del menú).
  const setRef = useCallback(
    (node: HTMLAnchorElement | HTMLButtonElement | null) => {
      if (!node) return;
      if (indexRef.current === -1) {
        indexRef.current = listRef.current.length;
        setIndex(indexRef.current);
      }
      listRef.current[indexRef.current] = node;
    },
    [listRef],
  );

  const isCheckbox = checked !== undefined;
  const staysOpen = keepOpen ?? isCheckbox;

  const sharedProps = {
    role: isCheckbox ? ("menuitemcheckbox" as const) : ("menuitem" as const),
    "aria-checked": isCheckbox ? checked : undefined,
    title,
    tabIndex: activeIndex === index ? 0 : -1,
    "data-active": activeIndex === index ? "" : undefined,
    className,
    ...getItemProps({
      onClick: () => {
        if (disabled) return;
        onClick?.();
        if (!staysOpen) setOpen(false);
      },
      onFocus: () => setActiveIndex(index),
    }),
  };

  if (href) {
    return (
      <Link ref={setRef} to={href} {...sharedProps}>
        {children}
      </Link>
    );
  }

  return (
    <button ref={setRef} type="button" disabled={disabled} {...sharedProps}>
      {children}
    </button>
  );
}

Menu.Trigger = MenuTrigger;
Menu.Content = MenuContent;
Menu.Item = MenuItem;
