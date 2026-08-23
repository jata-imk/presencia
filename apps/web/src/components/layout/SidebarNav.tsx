import {
  Activity,
  Archive,
  BarChart2,
  BookOpen,
  Calendar,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ChatListItem } from "./ChatListItem.js";
import { ModalNewFolder } from "../folders/ModalNewFolder.js";
import { BrandMark } from "../ui/BrandMark.js";
import { authClient } from "../../lib/auth-client.js";
import { useQuota } from "../../lib/use-quota.js";
import { useChatsStore } from "../../stores/chats-store.js";
import { useFoldersStore } from "../../stores/folders-store.js";

// Contenido del sidebar (F6.5 PR1). Es el MISMO árbol que renderizan las
// dos superficies: el <nav> in-flow de ≥768px y el drawer modal de mobile
// (SidebarDrawer). Por eso recibe `collapsed` como prop en vez de leerlo
// del store: dentro del drawer siempre va expandido, sin importar lo que
// el usuario haya elegido para el desktop.
//
// Los módulos que todavía no existen se pintan deshabilitados con "Pronto"
// en vez de omitirse: el mockup ya los diseñó, y fingir que Presencia solo
// tiene Chats sería más falso que mostrarlos apagados (AGENTS.md #6 — esto
// no es infra de más, es la nav quedando honesta sobre qué existe).
const MODULES = [
  { icon: MessageSquare, label: "Chats", to: "/chats" },
  { icon: Calendar, label: "Calendario", to: null },
  { icon: Activity, label: "Ritmo", to: null },
  { icon: BarChart2, label: "Analíticas", to: null },
  { icon: BookOpen, label: "Biblioteca", to: null },
] as const;

interface SidebarNavProps {
  collapsed: boolean;
  /** Ausente en el drawer: ahí no se colapsa, se cierra. */
  onToggleCollapsed?: () => void;
  /** El drawer se cierra al navegar; el nav in-flow no hace nada. */
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed, onToggleCollapsed, onNavigate }: SidebarNavProps) {
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
  const visibleChats = activeFolder
    ? (chats ?? []).filter((c) => c.folderId === activeFolder)
    : (chats ?? []).slice(0, 12);

  return (
    <>
      {/* Header. Colapsado a 56px no caben marca (28) + botón (28) + padding
          en la misma fila, así que el botón se va a su propia fila abajo. */}
      <div
        className={`flex shrink-0 items-center gap-2 py-4 ${collapsed ? "flex-col px-2" : "px-4"}`}
      >
        <Link
          to="/chats"
          onClick={onNavigate}
          aria-label="Presencia — ir a Chats"
          className="flex min-w-0 flex-1 items-center rounded-md"
        >
          <BrandMark withWordmark={!collapsed} />
        </Link>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="shrink-0 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-secondary-hover hover:text-fg"
          >
            {collapsed ? (
              <PanelLeftOpen size={15} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose size={15} strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>

      <div className={collapsed ? "px-2" : "px-3"}>
        {/* Navega a la pantalla de nuevo chat (routes/chats.tsx) en vez de
            crear el chat de una vez — un chat solo debe existir cuando el
            usuario mandó un mensaje real. Antes esto llamaba createChat()
            acá mismo y dejaba filas vacías en la DB con cada click. */}
        <Link
          to="/chats"
          onClick={onNavigate}
          aria-label="Nuevo chat"
          title="Nuevo chat"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover active:bg-primary-press"
        >
          <Plus size={15} strokeWidth={2} className="shrink-0" />
          {!collapsed && <span>Nuevo chat</span>}
        </Link>
      </div>

      <ul className={`mt-4 flex shrink-0 flex-col gap-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {MODULES.map((mod) => {
          const active = mod.to !== null && location.pathname.startsWith(mod.to);
          if (!mod.to) {
            return (
              <li key={mod.label}>
                <div
                  title={`${mod.label} — próximamente`}
                  className={`flex cursor-not-allowed items-center gap-2.5 rounded-md py-2 text-sm text-fg-muted opacity-60 ${
                    collapsed ? "justify-center px-2" : "px-2.5"
                  }`}
                >
                  <mod.icon size={15} strokeWidth={1.75} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{mod.label}</span>
                      <span className="rounded-full bg-tint-plum px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                        Pronto
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          }
          return (
            <li key={mod.label}>
              <Link
                to={mod.to}
                onClick={onNavigate}
                title={mod.label}
                className={`flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : "px-2.5"
                } ${active ? "bg-tint-plum text-brand" : "text-fg-secondary hover:bg-secondary-hover"}`}
              >
                <mod.icon size={15} strokeWidth={1.75} className="shrink-0" />
                {!collapsed && <span>{mod.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Carpetas + Recientes necesitan ancho real para truncar títulos: se
          ocultan colapsado, no por breakpoint. Antes esto era `lg:flex`, o
          sea que a 900px la app no mostraba ni un chat aunque hubiera lugar
          de sobra — ahora si el usuario lo tiene expandido, se ve. */}
      {!collapsed && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
          {folders && folders.length > 0 && (
            <div className="mb-3 shrink-0">
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
              className="mb-3 flex shrink-0 items-center gap-1.5 px-2.5 text-[10px] font-bold tracking-wide text-fg-muted uppercase transition-colors hover:text-fg"
            >
              Carpetas <Plus size={10} strokeWidth={2.5} />
            </button>
          )}

          <div className="mb-1.5 flex shrink-0 items-center justify-between px-2.5">
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
                <ChatListItem
                  chat={chat}
                  active={location.pathname === `/chats/${chat.id}`}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
            {activeFolder && visibleChats.length === 0 && (
              <li className="px-2.5 py-1.5 text-[12px] text-fg-muted">Esta carpeta está vacía.</li>
            )}
          </ul>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      <div className={`shrink-0 border-t border-line py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <Link
          to="/chats/archivados"
          onClick={onNavigate}
          title="Archivados"
          className={`mb-1 flex items-center gap-2.5 rounded-md py-2 text-sm text-fg-secondary transition-colors hover:bg-secondary-hover ${
            collapsed ? "justify-center px-2" : "px-2.5"
          }`}
        >
          <Archive size={15} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span>Archivados</span>}
        </Link>
        <Link
          to="/configuracion"
          onClick={onNavigate}
          title="Configuración"
          className={`mb-1 flex items-center gap-2.5 rounded-md py-2 text-sm text-fg-secondary transition-colors hover:bg-secondary-hover ${
            collapsed ? "justify-center px-2" : "px-2.5"
          }`}
        >
          <Settings size={15} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </Link>
        <div
          className={`flex items-center gap-2.5 py-1.5 ${collapsed ? "justify-center px-2" : "px-2.5"}`}
        >
          <div
            title={name || "Tu cuenta"}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tint-plum text-[10px] font-bold text-brand"
          >
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
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
                className="shrink-0 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-secondary-hover"
              >
                <LogOut size={14} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </div>

      {showNewFolder && (
        <ModalNewFolder
          onClose={() => setShowNewFolder(false)}
          onCreated={() => setShowNewFolder(false)}
        />
      )}
    </>
  );
}
