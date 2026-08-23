import {
  Activity,
  Archive,
  BarChart2,
  BookOpen,
  Calendar,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ChatListItem } from "./ChatListItem.js";
import { ModalNewFolder } from "../folders/ModalNewFolder.js";
import { authClient } from "../../lib/auth-client.js";
import { useQuota } from "../../lib/use-quota.js";
import { useChatsStore } from "../../stores/chats-store.js";
import { useFoldersStore } from "../../stores/folders-store.js";

// Sidebar del App Shell — portado de Chat Conversation.html /
// Chat Module.html (F6 PR5). Los módulos que todavía no existen se pintan
// deshabilitados con "Pronto" en vez de omitirse: el mockup ya los diseñó,
// y fingir que Presencia solo tiene Chats sería más falso que mostrarlos
// apagados (ver AGENTS.md #6, YAGNI — esto no es infra de más, es la nav
// real quedando honesta sobre qué existe).
//
// Responsive por CSS, sin JS (el mockup usa un prop `collapsed` booleano
// para tablet y `!mobile` para ocultarlo del todo — acá son breakpoints de
// Tailwind: <md oculto, md–lg colapsado a solo íconos, ≥lg completo con
// labels. Nada de esto depende de useMediaQuery: es layout puro, no ciclo
// de vida de montado/desmontado como el drawer).
const MODULES = [
  { icon: MessageSquare, label: "Chats", to: "/chats" },
  { icon: Calendar, label: "Calendario", to: null },
  { icon: Activity, label: "Ritmo", to: null },
  { icon: BarChart2, label: "Analíticas", to: null },
  { icon: BookOpen, label: "Biblioteca", to: null },
] as const;

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { quota, refresh: refreshQuota } = useQuota();
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);
  const folders = useFoldersStore((s) => s.folders);
  const refreshFolders = useFoldersStore((s) => s.refresh);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);
  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);
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

  async function handleLogout() {
    await authClient.signOut();
    void navigate("/login");
  }

  const activeFolderName = folders?.find((f) => f.id === activeFolder)?.name;
  // Filtro en el propio sidebar en vez de una FolderView dedicada (el
  // mockup sí tiene una pantalla completa por carpeta, con su propio header
  // y "Nuevo chat aquí") — versión mínima por ahora, se separa a su propia
  // ruta si hace falta más adelante.
  const visibleChats = activeFolder
    ? (chats ?? []).filter((c) => c.folderId === activeFolder)
    : (chats ?? []).slice(0, 12);

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
        {/* Navega a la pantalla de nuevo chat (routes/chats.tsx) en vez de
            crear el chat de una vez — un chat solo debe existir cuando el
            usuario mandó un mensaje real. Antes esto llamaba createChat()
            acá mismo y dejaba filas vacías en la DB con cada click. */}
        <Link
          to="/chats"
          aria-label="Nuevo chat"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover active:bg-primary-press"
        >
          <Plus size={15} strokeWidth={2} />
          <span className="hidden lg:inline">Nuevo chat</span>
        </Link>
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

      {/* Carpetas + Recientes necesitan ancho real para truncar títulos —
          solo desktop, igual que el mockup no las muestra en su variante
          "tablet". */}
      <div className="mt-5 hidden min-h-0 flex-1 flex-col px-3 lg:flex">
        {folders && folders.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between px-2.5">
              <p className="text-[10px] font-bold tracking-wide text-fg-muted uppercase">
                Carpetas
              </p>
              <button
                type="button"
                aria-label="Nueva carpeta"
                onClick={() => setShowNewFolder(true)}
                className="text-fg-muted transition-colors hover:text-fg"
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </div>
            <ul>
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setActiveFolder(activeFolder === f.id ? null : f.id)}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                      activeFolder === f.id
                        ? "bg-tint-plum text-brand"
                        : "text-fg-secondary hover:bg-secondary-hover"
                    }`}
                  >
                    <span className="shrink-0">{f.icon ?? "📁"}</span>
                    <span className="flex-1 truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(!folders || folders.length === 0) && (
          <button
            type="button"
            onClick={() => setShowNewFolder(true)}
            className="mb-3 flex items-center gap-1.5 px-2.5 text-[10px] font-bold tracking-wide text-fg-muted uppercase transition-colors hover:text-fg"
          >
            Carpetas <Plus size={10} strokeWidth={2.5} />
          </button>
        )}

        <div className="mb-1.5 flex items-center justify-between px-2.5">
          <p className="text-[10px] font-bold tracking-wide text-fg-muted uppercase">
            {activeFolderName ?? "Recientes"}
          </p>
          {activeFolder && (
            <button
              type="button"
              aria-label="Volver a Recientes"
              onClick={() => setActiveFolder(null)}
              className="text-fg-muted transition-colors hover:text-fg"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {/* px-1.5 en los dos lados, no solo pr- (antes solo tenía el
            padding derecho, para el scrollbar): overflow-y-auto implica
            overflow-x:auto también (spec de CSS Overflow), así que
            cualquier caja que se salga del borde IZQUIERDO de este <ul>
            —el anillo de foco de la fila, por ejemplo— se recorta ahí
            igual que se recortaba contra el derecho. */}
        <ul className="flex-1 overflow-y-auto px-1.5">
          {visibleChats.map((chat) => (
            <li key={chat.id}>
              <ChatListItem chat={chat} active={location.pathname === `/chats/${chat.id}`} />
            </li>
          ))}
          {activeFolder && visibleChats.length === 0 && (
            <li className="px-2.5 py-1.5 text-[12px] text-fg-muted">Esta carpeta está vacía.</li>
          )}
        </ul>
      </div>
      <div className="flex-1 lg:hidden" />

      <div className="border-t border-line px-3 py-3">
        <Link
          to="/chats/archivados"
          title="Archivados"
          className="mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-secondary-hover"
        >
          <Archive size={15} strokeWidth={1.75} className="shrink-0" />
          <span className="hidden lg:inline">Archivados</span>
        </Link>
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

      {showNewFolder && (
        <ModalNewFolder
          onClose={() => setShowNewFolder(false)}
          onCreated={() => setShowNewFolder(false)}
        />
      )}
    </nav>
  );
}
