import { ChevronRight, LogOut, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Menu } from "../ui/Menu.js";
import { authClient } from "../../lib/auth-client.js";

// Topbar del App Shell (Chat Conversation.html / Chat Module.html, F6 PR5).
// El menú del avatar vive sobre <Menu> (components/ui/Menu.tsx) desde el
// rework a floating-ui — antes duplicaba a mano el mismo
// useState+onBlurCapture+top-full que ChatOptionsMenu.tsx, con el mismo
// riesgo de cortarse contra el borde del viewport (ver el plan de
// arquitectura de portales).
//
// El buscador ⌘K del mockup no se pinta acá: no hay búsqueda implementada
// todavía y un input muerto es peor que omitirlo. El título de la
// conversación puntual (folder, red, editable) es responsabilidad de
// ConvHeader — este breadcrumb solo ubica la sección.
const SECTION_LABEL: Record<string, string> = {
  chats: "Chats",
  configuracion: "Configuración",
};

const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg transition-colors hover:bg-secondary-hover";

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

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
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-3 border-b border-line bg-card px-5">
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
      <Menu>
        <Menu.Trigger
          aria-label="Menú de cuenta"
          className="flex size-7 items-center justify-center rounded-full bg-tint-plum text-[10px] font-bold text-brand"
        >
          {initials}
        </Menu.Trigger>
        <Menu.Content className="w-52 rounded-xl border border-line bg-card p-1.5 shadow-lg outline-none">
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
