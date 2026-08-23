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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { ChatSummary } from "@presencia/shared";
import { ChatListItem } from "./ChatListItem.js";
import { SidebarFolderItem } from "./SidebarFolderItem.js";
import { ModalNewFolder } from "../folders/ModalNewFolder.js";
import { BrandMark } from "../ui/BrandMark.js";
import { authClient } from "../../lib/auth-client.js";
import { useQuota } from "../../lib/use-quota.js";
import { useChatsStore } from "../../stores/chats-store.js";
import { useFoldersStore } from "../../stores/folders-store.js";
import { useSidebarStore } from "../../stores/sidebar-store.js";

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

// "Hasta 5 carpetas visibles + link Ver todas" (overview §5).
const FOLDERS_PREVIEW = 5;
// "Los últimos 5-7 chats" del overview, con un poco de aire: ahora que
// Recientes excluye fijados y chats en carpeta, la lista es más corta.
const RECENTS_LIMIT = 8;

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
  const expandedFolderId = useSidebarStore((s) => s.expandedFolderId);
  const setExpandedFolder = useSidebarStore((s) => s.setExpandedFolder);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showAllFolders, setShowAllFolders] = useState(false);

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

  // Un solo pase por la lista para las tres secciones, en vez de un
  // .filter() por carpeta en cada render.
  const { pinnedChats, chatsByFolder, recentChats } = useMemo(() => {
    const all = chats ?? [];
    const byFolder = new Map<string, ChatSummary[]>();
    for (const c of all) {
      if (!c.folderId) continue;
      const list = byFolder.get(c.folderId);
      if (list) list.push(c);
      else byFolder.set(c.folderId, [c]);
    }
    return {
      // GET /chats ya viene ordenado con los fijados primero y por
      // pinned_at desc — el último que fijaste queda arriba.
      pinnedChats: all.filter((c) => c.pinnedAt !== null),
      chatsByFolder: byFolder,
      // Regla única: Recientes = ni fijado ni en carpeta. Un chat fijado
      // que además está en carpeta sale en Fijados Y dentro de su carpeta,
      // a propósito: fijar es un acto deliberado y la carpeta arranca
      // colapsada, así que la coincidencia es rara e intencional.
      recentChats: all.filter((c) => c.pinnedAt === null && !c.folderId).slice(0, RECENTS_LIMIT),
    };
  }, [chats]);

  const visibleFolders = showAllFolders
    ? (folders ?? [])
    : (folders ?? []).slice(0, FOLDERS_PREVIEW);

  // Si el chat abierto vive en una carpeta colapsada, con la regla nueva
  // desaparecería del sidebar entero y se perdería el "estás aquí". Abrir
  // su carpeta también da una expansión inicial con sentido en vez de
  // arrancar todo cerrado.
  const activeChatFolderId =
    chats?.find((c) => location.pathname === `/chats/${c.id}`)?.folderId ?? null;
  useEffect(() => {
    if (!activeChatFolderId) return;
    setExpandedFolder(activeChatFolderId);
    // Con más de FOLDERS_PREVIEW carpetas, la del chat activo puede caer
    // fuera del slice visible: expandirla no serviría de nada porque ni
    // siquiera está en el DOM, y como Recientes ya excluye todo lo que
    // tiene folderId, el chat abierto desaparecería del sidebar entero —
    // exactamente el problema que este efecto existe para evitar.
    const visibleIds = (folders ?? []).slice(0, FOLDERS_PREVIEW).map((f) => f.id);
    if (!visibleIds.includes(activeChatFolderId)) setShowAllFolders(true);
  }, [activeChatFolderId, setExpandedFolder, folders]);

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

      {/* Fijados + Carpetas + Recientes necesitan ancho real para truncar
          títulos: se ocultan colapsado, no por breakpoint. Antes esto era
          `lg:flex`, o sea que a 900px la app no mostraba ni un chat aunque
          hubiera lugar de sobra — ahora si el usuario lo tiene expandido,
          se ve.

          El overflow-y-auto vive en este wrapper y no en un <ul> suelto:
          con tres secciones, poner el scroll solo en la última dejaría
          Fijados y Carpetas fuera del área desplazable. px-1.5 en los DOS
          lados, no solo a la derecha: overflow-y implica overflow-x (spec
          de CSS Overflow), así que cualquier caja que se salga del borde
          IZQUIERDO —el anillo de foco de una fila, por ejemplo— se recorta
          igual que contra el derecho. */}
      {!collapsed && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-1.5">
          {/* px-1.5 acá + px-1.5 en el contenedor con overflow = los mismos
              px-3 que usan los módulos de arriba, sin que el anillo de foco
              de una fila quede pegado al borde recortable. */}
          <div className="px-1.5">
            {pinnedChats.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 px-2.5 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
                  Fijados
                </p>
                <ul>
                  {pinnedChats.map((chat) => (
                    <li key={chat.id}>
                      <ChatListItem
                        chat={chat}
                        active={location.pathname === `/chats/${chat.id}`}
                        onNavigate={onNavigate}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                  {visibleFolders.map((f) => (
                    <SidebarFolderItem
                      key={f.id}
                      folder={f}
                      chats={chatsByFolder.get(f.id) ?? []}
                      expanded={expandedFolderId === f.id}
                      onToggle={() => setExpandedFolder(expandedFolderId === f.id ? null : f.id)}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
                {/* "Hasta 5 visibles + Ver todas" (overview §5) resuelto como
                  toggle en el lugar: una ruta /carpetas dedicada no existe
                  y nadie la pidió todavía. */}
                {folders.length > FOLDERS_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setShowAllFolders((v) => !v)}
                    className="mt-0.5 w-full px-2.5 py-1 text-left text-[10px] font-medium text-fg-muted transition-colors hover:text-fg"
                  >
                    {showAllFolders ? "Ver menos" : `Ver todas (${String(folders.length)})`}
                  </button>
                )}
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

            <p className="mb-1.5 px-2.5 text-[10px] font-bold tracking-wide text-fg-muted uppercase">
              Recientes
            </p>
            <ul>
              {recentChats.map((chat) => (
                <li key={chat.id}>
                  <ChatListItem
                    chat={chat}
                    active={location.pathname === `/chats/${chat.id}`}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
              {/* Un usuario ordenado puede quedarse sin chats sueltos: no
                dejar un hueco mudo donde antes había una lista. */}
              {recentChats.length === 0 && (chats?.length ?? 0) > 0 && (
                <li className="px-2.5 py-1.5 text-[11px] text-fg-muted">
                  Todos tus chats están en carpetas.
                </li>
              )}
            </ul>
          </div>
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
