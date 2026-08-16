import { Link, NavLink, Outlet } from "react-router";

// Sub-sidebar con los 3 grupos del overview §3 (CUENTA/CONTENIDO/PLAN).
// En F4 solo Mi perfil y Voz de marca son navegables — el resto se lista
// deshabilitado. Completo desde el arranque para no reescribir la
// navegación en cada fase futura.
interface NavItem {
  label: string;
  to?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "CUENTA",
    items: [{ label: "Mi perfil", to: "/configuracion/mi-perfil" }, { label: "Apariencia" }],
  },
  {
    title: "CONTENIDO",
    items: [
      { label: "Voz de marca", to: "/configuracion/voz-de-marca" },
      { label: "Plantillas" },
      // F6: navegable — antes solo listada deshabilitada.
      { label: "Canales conectados", to: "/configuracion/canales" },
    ],
  },
  {
    title: "PLAN",
    // F5: "Créditos y plan" navegable. "Facturación" se queda deshabilitada
    // — no hay proveedor de pago decidido todavía.
    items: [{ label: "Créditos y plan", to: "/configuracion/plan" }, { label: "Facturación" }],
  },
];

export function ConfiguracionLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <Link to="/chats" className="w-fit text-sm text-fg-secondary hover:text-fg">
        ← Volver a Chats
      </Link>
      <div className="flex gap-8">
        <nav className="flex w-48 shrink-0 flex-col gap-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <p className="px-2 text-xs font-semibold text-fg-muted">{group.title}</p>
              {group.items.map((item) =>
                item.to ? (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-md px-2 py-1.5 text-sm ${
                        isActive
                          ? "bg-tint-plum font-medium text-fg"
                          : "text-fg-secondary hover:bg-secondary-hover"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <span
                    key={item.label}
                    className="cursor-not-allowed px-2 py-1.5 text-sm text-fg-muted"
                  >
                    {item.label}
                  </span>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
