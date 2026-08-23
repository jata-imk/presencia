// `Menu` de lucide colisiona con nuestro <Menu> compuesto (ui/Menu.tsx).
import { ChevronRight, LogOut, Menu as MenuIcon, Palette, Search, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { ThemeToggle } from "./ThemeToggle.js";
import { Menu } from "../ui/Menu.js";
import { authClient } from "../../lib/auth-client.js";
import { useCommandPaletteStore } from "../../stores/command-palette-store.js";
import { useSidebarStore } from "../../stores/sidebar-store.js";

// Topbar del App Shell (Chat Conversation.html / Chat Module.html, F6 PR5).
// El menú del avatar vive sobre <Menu> (components/ui/Menu.tsx) desde el
// rework a floating-ui — antes duplicaba a mano el mismo
// useState+onBlurCapture+top-full que ChatOptionsMenu.tsx, con el mismo
// riesgo de cortarse contra el borde del viewport (ver el plan de
// arquitectura de portales).
//
// El buscador ⌘K abre CommandPalette (montado en ProtectedLayout): acá es
// solo el trigger, una píldora a ≥md y un ícono en mobile, como pide el
// overview §5. El título de la conversación puntual (folder, red,
// editable) es responsabilidad de ConvHeader — este breadcrumb solo ubica
// la sección.
const SECTION_LABEL: Record<string, string> = {
  chats: "Chats",
  calendario: "Calendario",
  configuracion: "Configuración",
};

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:bg-secondary-hover";

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const openMobile = useSidebarStore((s) => s.openMobile);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K";

  const segment = location.pathname.split("/")[1] ?? "";
  const label = SECTION_LABEL[segment] ?? "Presencia";

  const name = session?.user.displayName ?? session?.user.name ?? "";
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  async function handleLogout() {
    await authClient.signOut();
    void navigate("/login");
  }

  return (
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-3 border-b border-line bg-card px-3 md:px-5">
      {/* Único acceso a la navegación abajo de 768px — ahí el Sidebar se
          monta como drawer modal, no como columna. */}
      <button
        type="button"
        onClick={openMobile}
        aria-label="Abrir menú"
        className="-ml-1 shrink-0 rounded-md p-1.5 text-fg-secondary transition-colors hover:bg-secondary-hover md:hidden"
      >
        <MenuIcon size={18} strokeWidth={1.75} />
      </button>
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        <span>{label}</span>
        {segment === "chats" && location.pathname !== "/chats" && (
          <>
            <ChevronRight size={12} strokeWidth={1.75} />
            <span className="font-semibold text-fg">Conversación</span>
          </>
        )}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={openPalette}
        aria-label="Buscar en Presencia"
        className="hidden min-w-52 items-center gap-2 rounded-lg border border-line bg-secondary px-3 py-1.5 text-fg-muted transition-colors hover:bg-secondary-hover md:flex"
      >
        <Search size={14} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 text-left text-xs">Buscar…</span>
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold">
          {shortcut}
        </span>
      </button>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Buscar en Presencia"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary-hover md:hidden"
      >
        <Search size={15} strokeWidth={1.75} />
      </button>
      <ThemeToggle />
      <Menu>
        <Menu.Trigger
          aria-label="Menú de cuenta"
          className="flex size-7 items-center justify-center rounded-full bg-tint-plum text-[10px] font-bold text-brand"
        >
          {initials}
        </Menu.Trigger>
        <Menu.Content className="w-52 rounded-xl border border-line bg-card p-1.5 shadow-lg outline-none">
          {/* El overview (§5) pedía un toggle de tema también acá. Se
              resuelve con un link a Apariencia en vez de un TERCER control
              del mismo bit (topbar + menú + Configuración): tres formas de
              voltear el mismo switch es ruido, y Apariencia es la única
              que ofrece las tres opciones, incluida "Sistema". */}
          <Menu.Item href="/configuracion/apariencia" className={ITEM_CLASS}>
            <Palette size={14} strokeWidth={1.75} />
            Apariencia
          </Menu.Item>
          <Menu.Item href="/configuracion" className={ITEM_CLASS}>
            <Settings size={14} strokeWidth={1.75} />
            Configuración
          </Menu.Item>
          <div className="my-1 h-px bg-line" />
          <Menu.Item
            onClick={() => void handleLogout()}
            className={`${ITEM_CLASS} text-error hover:bg-error-bg`}
          >
            <LogOut size={14} strokeWidth={1.75} />
            Cerrar sesión
          </Menu.Item>
        </Menu.Content>
      </Menu>
    </header>
  );
}
