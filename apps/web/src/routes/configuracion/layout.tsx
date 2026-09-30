import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Images,
  Mic,
  Palette,
  Plug,
  TrendingUp,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { ultimaRutaDeLaApp } from "../../lib/ultima-ruta.js";

// Configuración tiene su propio shell (F9.7, mock de Claude Design): no vive
// dentro del sidebar de la app sino que lo reemplaza, con un header propio y
// un sub-sidebar. Es un lugar al que se entra a ajustar algo y del que se
// sale; el sidebar de chats al lado solo competía por el ancho, y a 375px lo
// dejaba en una columna de ~90px.
//
// La ruta lo declara con `handle: { ownShell: true }` (App.tsx) y
// ProtectedLayout deja de pintar Sidebar/Topbar/Drawer.
//
// Por debajo de `md` el sub-sidebar pasa a una fila de pestañas con scroll
// horizontal. El mock solo trae escritorio; esto es lo mínimo que mantiene
// todas las secciones a un toque sin esconderlas detrás de un menú.

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "CUENTA",
    items: [
      { label: "Mi perfil", to: "/configuracion/mi-perfil", icon: User },
      { label: "Apariencia", to: "/configuracion/apariencia", icon: Palette },
    ],
  },
  {
    title: "CONTENIDO",
    items: [
      { label: "Voz de marca", to: "/configuracion/voz-de-marca", icon: Mic },
      // F9.6: la personalización de la búsqueda de tendencias de Ritmo. El
      // mock es anterior a esta página, así que el ícono no sale de ahí.
      { label: "Tendencias", to: "/configuracion/tendencias", icon: TrendingUp },
      // F10.6: con qué estilo se generan las imágenes. Junto a Voz de marca
      // porque vive en ella (brand_voices.image_style).
      { label: "Estilo visual", to: "/configuracion/estilo-visual", icon: Images },
      { label: "Plantillas", to: "/configuracion/plantillas", icon: FileText },
      { label: "Canales conectados", to: "/configuracion/canales", icon: Plug },
    ],
  },
  {
    title: "PLAN",
    items: [
      { label: "Créditos y plan", to: "/configuracion/plan", icon: Zap },
      // Sin proveedor de pago decidido todavía: navega a "Próximamente".
      { label: "Facturación", to: "/configuracion/facturacion", icon: CreditCard },
    ],
  },
];

const ITEMS = GROUPS.flatMap((group) => group.items);

/** La sección activa. Por prefijo: `/canales/desconectadas` sigue siendo Canales. */
export function seccionActiva(pathname: string): NavItem | undefined {
  return ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

export function ConfiguracionLayout() {
  const { pathname } = useLocation();
  const activa = seccionActiva(pathname);
  const pestanas = useRef<HTMLElement>(null);

  // En móvil la pestaña activa puede quedar fuera de la fila (Facturación es
  // la última): se trae a la vista al navegar, o la página no diría dónde
  // estás.
  useEffect(() => {
    pestanas.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col bg-surface text-fg">
      <header className="flex h-15 shrink-0 items-center gap-3 border-b border-line bg-card px-4 md:px-5">
        <Link
          to={ultimaRutaDeLaApp()}
          aria-label="Volver a la app"
          title="Volver a la app"
          className="flex size-8.5 shrink-0 items-center justify-center rounded-md text-brand hover:bg-secondary"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </Link>
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-brand">
            Configuración
          </span>
          {activa && (
            <>
              <ChevronRight size={15} className="shrink-0 text-fg-muted" aria-hidden />
              <span className="truncate font-display text-base font-medium text-fg-secondary">
                {activa.label}
              </span>
            </>
          )}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Escritorio: sub-sidebar con grupos. */}
        <nav
          aria-label="Secciones de configuración"
          className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-card px-2.5 py-4 md:flex"
        >
          {GROUPS.map((group, index) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <p
                className={`px-2.5 pb-2 font-display text-[10px] font-bold tracking-widest text-fg-muted ${
                  index === 0 ? "pt-1.5" : "pt-4.5"
                }`}
              >
                {group.title}
              </p>
              {group.items.map((item) => (
                <ItemDeNav key={item.to} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Móvil: una fila de pestañas, sin los títulos de grupo. */}
        <nav
          ref={pestanas}
          aria-label="Secciones de configuración"
          className="flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line bg-card px-3 py-2 md:hidden"
        >
          {ITEMS.map((item) => (
            <ItemDeNav key={item.to} item={item} compacto />
          ))}
        </nav>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-(--content-max-w) px-4 pt-6 pb-20 md:px-12 md:pt-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function ItemDeNav({ item, compacto = false }: { item: NavItem; compacto?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 font-display text-sm whitespace-nowrap ${
          isActive
            ? "bg-tint-plum font-semibold text-brand"
            : "font-medium text-fg-secondary hover:bg-secondary"
        } ${compacto ? "" : "w-full"}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            strokeWidth={1.5}
            className={isActive ? "text-brand" : "text-fg-muted"}
            aria-hidden
          />
          {item.label}
        </>
      )}
    </NavLink>
  );
}
