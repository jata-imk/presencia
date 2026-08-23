import { FloatingFocusManager, FloatingPortal, useFloating } from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { SidebarNav } from "./SidebarNav.js";
import { backdropFade, sheetLeft } from "../../lib/motion.js";
import { useSidebarStore } from "../../stores/sidebar-store.js";

// Navegación de mobile (<768px). Hasta F6.5 el sidebar era simplemente
// `hidden` abajo de md y el Topbar no tenía hamburguesa: la app NO tenía
// ninguna forma de navegar en teléfono. El overview §5 lo pide desde
// siempre; esto lo cierra.
//
// A diferencia del panel desktop del ScheduleDrawer (que es layout in-flow
// que empuja, ADR-014), este SÍ es modal de verdad: backdrop, trampa de
// foco y role="dialog" (ADR-015 — la distinción Menu vs Dialog). El orden
// de anidado es copia del bottom sheet de ScheduleDrawer.tsx, que ya está
// probado: AnimatePresence > [backdrop, FloatingFocusManager > panel].
//
// No necesita lockScroll: el shell ya es h-dvh overflow-hidden.
export function SidebarDrawer() {
  const open = useSidebarStore((s) => s.mobileOpen);
  const close = useSidebarStore((s) => s.closeMobile);
  const location = useLocation();

  // useFloating solo por el contexto que FloatingFocusManager necesita —
  // no hay anclaje ni middleware: el panel está pegado al viewport.
  const { refs, context } = useFloating({ open, onOpenChange: (o) => !o && close() });

  // Cerrar al navegar. Sin esto, tocar un chat deja el drawer abierto
  // encima de la conversación recién abierta.
  useEffect(() => {
    close();
  }, [location.pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <FloatingPortal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              aria-hidden="true"
              onClick={close}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={backdropFade}
              className="fixed inset-0 z-40 bg-overlay md:hidden"
            />
            <FloatingFocusManager context={context}>
              <motion.div
                ref={refs.setFloating}
                role="dialog"
                aria-modal="true"
                aria-label="Navegación principal"
                tabIndex={-1}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={sheetLeft}
                className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col border-r border-line bg-card shadow-xl outline-none md:hidden"
              >
                <SidebarNav collapsed={false} onNavigate={close} />
              </motion.div>
            </FloatingFocusManager>
          </>
        )}
      </AnimatePresence>
    </FloatingPortal>
  );
}
