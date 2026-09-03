import { useEffect } from "react";
import { SidebarDrawer } from "./SidebarDrawer.js";
import { SidebarNav } from "./SidebarNav.js";
import { SidebarResizeHandle } from "./SidebarResizeHandle.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import { applySidebarWidth, useSidebarStore } from "../../stores/sidebar-store.js";

// Sidebar del App Shell. Dos superficies, un solo contenido (SidebarNav):
// el <nav> in-flow de ≥768px y el drawer modal de <768px.
//
// Desde F6.5 esto es JS-driven a propósito, no breakpoints puros como en
// F6: el colapso manual, el ancho arrastrable y el drawer modal no se
// pueden expresar en CSS. Lo que SÍ sigue siendo CSS puro es el ancho en
// sí — el <nav> nunca lleva un style inline, solo la clase que lee
// --sidebar-width; ver sidebar-store.ts (applySidebarWidth) para por qué
// eso importa durante el arrastre.
//
// El colapso automático por viewport quedó reemplazado por decisión del
// usuario + default por viewport (ADR-014 addendum / overview §5): mientras
// no toque el botón manda el ancho de pantalla; en cuanto lo toca, su
// elección gana y persiste.
export function Sidebar() {
  const isTablet = useMediaQuery("(min-width: 768px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const userCollapsed = useSidebarStore((s) => s.userCollapsed);
  const width = useSidebarStore((s) => s.width);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const closeMobile = useSidebarStore((s) => s.closeMobile);
  const clearUserCollapsed = useSidebarStore((s) => s.clearUserCollapsed);

  const collapsed = userCollapsed ?? !isDesktop;

  // Aplica el ancho persistido al montar (y si cambia por teclado). El
  // arrastre escribe la var directo y no pasa por acá.
  useEffect(() => {
    applySidebarWidth(width);
  }, [width]);

  // Abajo de 1024 manda el ancho, no la preferencia: la elección se guarda en
  // localStorage y sobrevivía al cambio de tamaño, así que un sidebar abierto
  // en escritorio seguía abierto en tablet. La decisión no se borra, solo se
  // suspende — al volver a escritorio, vuelve a aplicarse.
  useEffect(() => {
    if (!isDesktop) clearUserCollapsed();
  }, [isDesktop, clearUserCollapsed]);

  // Al cruzar a ≥768 el drawer tiene que morir: si no, queda un
  // role="dialog" montado atrapando el foco sobre el layout de escritorio.
  useEffect(() => {
    if (isTablet) closeMobile();
  }, [isTablet, closeMobile]);

  if (!isTablet) return <SidebarDrawer />;

  return (
    <nav
      aria-label="Navegación principal"
      data-collapsed={collapsed ? "true" : undefined}
      className={`relative flex shrink-0 flex-col border-r border-line bg-card transition-[width] duration-(--duration-normal) ease-(--ease-out) ${
        collapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)"
      }`}
    >
      <SidebarNav collapsed={collapsed} onToggleCollapsed={() => toggleCollapsed(collapsed)} />
      {!collapsed && <SidebarResizeHandle />}
    </nav>
  );
}
