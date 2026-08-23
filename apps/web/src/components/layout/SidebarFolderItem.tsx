import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { useLocation } from "react-router";
import type { ChatSummary, FolderDto } from "@presencia/shared";
import { ChatListItem } from "./ChatListItem.js";
import { collapseSection } from "../../lib/motion.js";

// Fila de carpeta del sidebar, con su sublista desplegable (F6.5 PR3).
// Antes, hacer click en una carpeta REEMPLAZABA la lista entera de
// Recientes (el título cambiaba y aparecía una X para volver); ahora se
// expande en su lugar y Recientes sigue abajo.
//
// Los chats no se piden: chats-store ya trae todos los no archivados con
// su folderId y GET /chats no tiene LIMIT — el agrupado se hace en memoria
// en SidebarNav, así que expandir una carpeta cuesta cero requests.
export function SidebarFolderItem({
  folder,
  chats,
  expanded,
  onToggle,
  onNavigate,
}: {
  folder: FolderDto;
  chats: ChatSummary[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const listId = useId();

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={listId}
        className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
          expanded ? "bg-tint-plum text-brand" : "text-fg-secondary hover:bg-secondary-hover"
        }`}
      >
        <ChevronRight
          size={11}
          strokeWidth={2.5}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-(--duration-fast) ease-(--ease-out) ${
            expanded ? "rotate-90" : ""
          }`}
        />
        {/* Los emojis de carpeta los elige el usuario: son iconos
            personalizables, no cromo de navegación (overview §"Nunca
            emojis en chrome de navegación"). */}
        <span className="shrink-0">{folder.icon ?? "📁"}</span>
        <span className="flex-1 truncate">{folder.name}</span>
        <span className="shrink-0 text-[9px] text-fg-muted tabular-nums">{folder.chatCount}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={listId}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={collapseSection}
            className="overflow-hidden"
          >
            <ul className="pl-3">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <ChatListItem
                    chat={chat}
                    active={location.pathname === `/chats/${chat.id}`}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
              {chats.length === 0 && (
                <li className="px-2.5 py-1.5 text-[11px] text-fg-muted">
                  Esta carpeta está vacía.
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
