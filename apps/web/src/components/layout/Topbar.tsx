import { ChevronRight, LogOut, Settings } from "lucide-react";
import { useState, type FocusEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "../../lib/auth-client.js";

// Topbar del App Shell (Chat Conversation.html / Chat Module.html, F6 PR5).
// El buscador ⌘K del mockup no se pinta acá: no hay búsqueda implementada
// todavía y un input muerto es peor que omitirlo. El título de la
// conversación puntual (folder, red, editable) es responsabilidad de
// ConvHeader, que llega en PR6 junto con la reescritura de chat.tsx — este
// breadcrumb solo ubica la sección, como hacía el header viejo de cada ruta.
const SECTION_LABEL: Record<string, string> = {
  chats: "Chats",
  configuracion: "Configuración",
};

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);

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

  function handleBlurCapture(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) setMenuOpen(false);
  }

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
      <div className="relative" onBlurCapture={handleBlurCapture}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex size-7 items-center justify-center rounded-full bg-tint-plum text-[10px] font-bold text-brand"
        >
          {initials}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 z-20 mt-1.5 w-52 rounded-xl border border-line bg-card p-1.5 shadow-lg"
          >
            <Link
              to="/configuracion"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-fg transition-colors hover:bg-secondary-hover"
            >
              <Settings size={14} strokeWidth={1.75} />
              Configuración
            </Link>
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-error transition-colors hover:bg-error-bg"
            >
              <LogOut size={14} strokeWidth={1.75} />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
