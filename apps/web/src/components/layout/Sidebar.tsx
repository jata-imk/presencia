import {
  BarChart3,
  BookOpen,
  Calendar,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "../../lib/auth-client.js";
import { useQuota } from "../../lib/use-quota.js";
import { useChatsStore } from "../../stores/chats-store.js";

// Sidebar del App Shell — portado de Chat Conversation.html /
// Chat Module.html (F6 PR5). Los módulos que todavía no existen se pintan
// deshabilitados con "Pronto" en vez de omitirse: el mockup ya los diseñó,
// y fingir que Presencia solo tiene Chats sería más falso que mostrarlos
// apagados (ver AGENTS.md #6, YAGNI — esto no es infra de más, es la nav
// real quedando honesta sobre qué existe). Carpetas del mockup no se
// pintan: no tienen tabla propia expuesta todavía.
//
// Responsive por CSS, sin JS (el mockup usa un prop `collapsed` booleano
// para tablet y `!mobile` para ocultarlo del todo — acá son breakpoints de
// Tailwind: <md oculto, md–lg colapsado a solo íconos, ≥lg completo con
// labels. Nada de esto depende de useMediaQuery: es layout puro, no ciclo
// de vida de montado/desmontado como el drawer).
const MODULES = [
  { icon: MessageSquare, label: "Chats", to: "/chats" },
  { icon: Calendar, label: "Calendario", to: null },
  { icon: BarChart3, label: "Ritmo", to: null },
  { icon: BarChart3, label: "Analíticas", to: null },
  { icon: BookOpen, label: "Biblioteca", to: null },
] as const;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { quota, refresh: refreshQuota } = useQuota();
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);
  const createChat = useChatsStore((s) => s.create);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const name = session?.user.displayName ?? session?.user.name ?? "";
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  async function handleNewChat() {
    const chat = await createChat();
    void navigate(`/chats/${chat.id}`);
  }

  async function handleLogout() {
    await authClient.signOut();
    void navigate("/login");
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="hidden shrink-0 flex-col border-r border-line bg-card md:flex md:w-14 lg:w-(--sidebar-width)"
    >
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
          P
        </div>
        <span className="hidden font-display text-sm font-semibold text-brand lg:inline">
          Presencia
        </span>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={() => void handleNewChat()}
          aria-label="Nuevo chat"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover active:bg-primary-press"
        >
          <Plus size={15} strokeWidth={2} />
          <span className="hidden lg:inline">Nuevo chat</span>
        </button>
      </div>

      <ul className="mt-4 flex flex-col gap-0.5 px-3">
        {MODULES.map((mod) => {
          const active = mod.to !== null && location.pathname.startsWith(mod.to);
          if (!mod.to) {
            return (
              <li key={mod.label}>
                <div
                  title={mod.label}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-muted opacity-60 lg:justify-start"
                >
                  <mod.icon size={15} strokeWidth={1.75} className="shrink-0" />
                  <span className="hidden flex-1 lg:inline">{mod.label}</span>
                  <span className="hidden rounded-full bg-tint-plum px-1.5 py-0.5 text-[9px] font-semibold text-accent lg:inline">
                    Pronto
                  </span>
                </div>
              </li>
            );
          }
          return (
            <li key={mod.label}>
              <Link
                to={mod.to}
                title={mod.label}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-tint-plum text-brand" : "text-fg-secondary hover:bg-secondary-hover"
                }`}
              >
                <mod.icon size={15} strokeWidth={1.75} className="shrink-0" />
                <span className="hidden lg:inline">{mod.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Recientes necesita ancho real para truncar títulos — solo desktop,
          igual que el mockup no lo muestra en su variante "tablet". */}
      <div className="mt-5 hidden min-h-0 flex-1 flex-col px-3 lg:flex">
        <p className="mb-1.5 px-2.5 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
          Recientes
        </p>
        <ul className="flex-1 overflow-y-auto">
          {(chats ?? []).slice(0, 12).map((chat) => (
            <li key={chat.id}>
              <Link
                to={`/chats/${chat.id}`}
                className={`block truncate rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  location.pathname === `/chats/${chat.id}`
                    ? "bg-tint-plum text-brand"
                    : "text-fg-secondary hover:bg-secondary-hover"
                }`}
              >
                {chat.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 lg:hidden" />

      <div className="border-t border-line px-3 py-3">
        <Link
          to="/configuracion"
          title="Configuración"
          className="mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-secondary-hover"
        >
          <Settings size={15} strokeWidth={1.75} className="shrink-0" />
          <span className="hidden lg:inline">Configuración</span>
        </Link>
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <div
            title={name || "Tu cuenta"}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tint-plum text-[10px] font-bold text-brand"
          >
            {initials}
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-[12px] font-semibold text-fg">{name || "Tu cuenta"}</p>
            {quota && (
              <p className="flex items-center gap-1 text-[10px] text-fg-muted">
                <Sparkles size={10} strokeWidth={1.75} />
                {quota.percentRemaining}% de cuota
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar sesión"
            onClick={() => void handleLogout()}
            className="hidden shrink-0 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-secondary-hover lg:block"
          >
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </nav>
  );
}
