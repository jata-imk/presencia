import { Archive, FileText, Folder, MessageSquare, Search, Settings } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Modal } from "../ui/Modal.js";
import { useCommandPalette } from "../../lib/floating/use-command-palette.js";
import { useSearch } from "../../lib/use-search.js";
import { useCommandPaletteStore } from "../../stores/command-palette-store.js";
import { useSidebarStore } from "../../stores/sidebar-store.js";

// Paleta de comandos ⌘K (ADR-017). Consume GET /api/search y agrega una
// sección "Ir a" que se resuelve del lado del cliente: las rutas son
// estáticas y no hay nada que buscar en el servidor.
//
// Los módulos deshabilitados (Calendario, Ritmo, Analíticas, Biblioteca)
// NO aparecen: un resultado que no navega a ningún lado es peor que no
// tener el resultado.

interface Action {
  key: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);

  // El atajo vive acá arriba, fuera del `if (!open)`: tiene que escuchar
  // aunque la paleta esté cerrada — es lo que la abre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "k" && e.key !== "K") return;
      if (!e.metaKey && !e.ctrlKey) return;
      // IME: mientras se compone un carácter, la tecla no es del usuario.
      if (e.repeat || e.isComposing) return;
      // preventDefault es obligatorio: Ctrl+K enfoca la omnibox en
      // Chrome/Windows. No se filtra por "el foco está en un input" —
      // ⌘K debe abrir aunque estés escribiendo en el composer.
      e.preventDefault();
      openPalette();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPalette]);

  if (!open) return null;
  return <PaletteDialog onClose={closePalette} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const setExpandedFolder = useSidebarStore((s) => s.setExpandedFolder);
  const openMobile = useSidebarStore((s) => s.openMobile);
  const [query, setQuery] = useState("");
  const { results, loading, error, tooShort } = useSearch(query, true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const titleId = useId();

  const {
    listRef,
    activeIndex,
    setActiveIndex,
    getReferenceProps,
    getFloatingProps,
    getItemProps,
  } = useCommandPalette({ open: true, onClose });

  // Una sola lista plana de acciones — los índices que useListNavigation
  // maneja son sobre ESTA lista, no sobre cada sección. Las secciones son
  // presentación; la navegación con flechas las atraviesa de corrido.
  const actions = useMemo<Action[]>(() => {
    const go = (to: string) => () => {
      void navigate(to);
      onClose();
    };
    const items: Action[] = [];

    for (const c of results.chats) {
      items.push({
        key: `chat-${c.id}`,
        label: c.title,
        hint: c.archivedAt ? "Archivado" : undefined,
        icon: c.archivedAt ? Archive : MessageSquare,
        run: go(`/chats/${c.id}`),
      });
    }
    for (const m of results.messages) {
      items.push({
        key: `msg-${m.id}`,
        label: m.chatTitle,
        hint: stripTags(m.snippet),
        icon: MessageSquare,
        run: go(`/chats/${m.chatId}`),
      });
    }
    for (const f of results.folders) {
      items.push({
        key: `folder-${f.id}`,
        label: `${f.icon ?? "📁"}  ${f.name}`,
        icon: Folder,
        // No hay ruta por carpeta: la acción es expandirla en el sidebar.
        // Este es el pago de haber puesto expandedFolderId en el store.
        run: () => {
          setExpandedFolder(f.id);
          if (window.innerWidth < 768) openMobile();
          void navigate("/chats");
          onClose();
        },
      });
    }
    for (const card of results.cards) {
      items.push({
        key: `card-${card.id}`,
        label: NETWORK_META[card.network].label,
        hint: stripTags(card.snippet),
        icon: FileText,
        run: card.chatId ? go(`/chats/${card.chatId}`) : onClose,
      });
    }

    const q = query.trim().toLowerCase();
    const nav: Action[] = [
      { key: "go-chats", label: "Chats", icon: MessageSquare, run: go("/chats") },
      { key: "go-archivados", label: "Archivados", icon: Archive, run: go("/chats/archivados") },
      { key: "go-config", label: "Configuración", icon: Settings, run: go("/configuracion") },
    ];
    items.push(...nav.filter((n) => !q || n.label.toLowerCase().includes(q)));

    return items;
  }, [results, query, navigate, onClose, setExpandedFolder, openMobile]);

  const sections = useMemo(() => {
    const bounds: { title: string; prefix: string }[] = [
      { title: "Chats", prefix: "chat-" },
      { title: "Mensajes", prefix: "msg-" },
      { title: "Carpetas", prefix: "folder-" },
      { title: "Publicaciones", prefix: "card-" },
      { title: "Ir a", prefix: "go-" },
    ];
    return bounds
      .map((b) => ({
        title: b.title,
        items: actions
          .map((a, i) => ({ action: a, index: i }))
          .filter((x) => x.action.key.startsWith(b.prefix)),
      }))
      .filter((s) => s.items.length > 0);
  }, [actions]);

  // El reset de use-command-palette solo corre al cerrar, y acá la paleta
  // vive con `open: true` fijo — o sea que nunca dispara mientras está
  // abierta. Sin esto, tras mover las flechas y seguir tecleando el índice
  // apunta a la posición vieja de una lista que ya cambió: Enter abre el
  // resultado equivocado, o no hace nada si la lista se acortó. Se trunca
  // también listRef para que useListNavigation no acote contra un largo
  // que ya no existe.
  useEffect(() => {
    setActiveIndex(null);
    listRef.current.length = actions.length;
  }, [actions, setActiveIndex, listRef]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && activeIndex !== null) {
      e.preventDefault();
      actions[activeIndex]?.run();
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidth="max-w-xl"
      align="top"
      initialFocus={inputRef}
    >
      <div className="-m-6 flex flex-col">
        <h2 id={titleId} className="sr-only">
          Buscar en Presencia
        </h2>

        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar chats, mensajes, carpetas…"
            aria-label="Buscar en Presencia"
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
            // El onKeyDown va DENTRO de getReferenceProps y no como prop
            // suelta: floating-ui compone el suyo (las flechas) con el
            // nuestro (Enter). Pasado por fuera, el spread lo reemplaza y
            // Enter deja de hacer nada — o, si va después del spread,
            // rompe la navegación con flechas.
            {...getReferenceProps({ onKeyDown: handleKeyDown })}
            // DESPUÉS del spread a propósito: getReferenceProps lo
            // sobreescribiría con undefined (el input no está registrado
            // como reference — la paleta no se ancla a nada, solo usa el
            // motor de navegación). Sin esto un lector de pantalla no
            // anuncia qué opción está seleccionada al mover las flechas.
            aria-activedescendant={
              activeIndex !== null ? `${listboxId}-${String(activeIndex)}` : undefined
            }
          />
          {loading && <span className="shrink-0 text-[11px] text-fg-muted">Buscando…</span>}
        </div>

        <div
          id={listboxId}
          className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
          {...getFloatingProps()}
        >
          {tooShort && <Empty>Escribe al menos dos letras.</Empty>}
          {error && <Empty>No se pudo buscar. Inténtalo de nuevo.</Empty>}
          {!tooShort && !error && actions.length === 0 && !loading && (
            <Empty>No encontramos nada con «{query.trim()}».</Empty>
          )}

          {sections.map((section) => (
            // role="group" y no un <div> pelado: sin un rol válido, las
            // opciones dejan de estar "poseídas" por el listbox según ARIA
            // y un lector de pantalla no las enumera — justo lo que el
            // aria-activedescendant de arriba intenta lograr.
            <div
              key={section.title}
              role="group"
              aria-labelledby={`${listboxId}-${section.title}`}
              className="mb-1 last:mb-0"
            >
              <p
                id={`${listboxId}-${section.title}`}
                className="px-2.5 py-1 text-[10px] font-bold tracking-wide text-fg-muted uppercase"
              >
                {section.title}
              </p>
              {section.items.map(({ action, index }) => (
                <button
                  key={action.key}
                  type="button"
                  id={`${listboxId}-${String(index)}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  ref={(node) => {
                    listRef.current[index] = node;
                  }}
                  {...getItemProps({ onClick: action.run })}
                  // Fuera del tab order a propósito: en un combobox con
                  // aria-activedescendant el foco NO se mueve a las
                  // opciones, se queda en el input. Sin esto,
                  // FloatingFocusManager enfoca el primer <button> al abrir
                  // y el usuario no puede escribir.
                  tabIndex={-1}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    activeIndex === index ? "bg-secondary-hover" : ""
                  }`}
                >
                  <action.icon size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{action.label}</span>
                    {action.hint && (
                      <span className="block truncate text-[11px] text-fg-muted">
                        {action.hint}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <p className="border-t border-line px-4 py-2 text-[11px] text-fg-muted">
          Busca en títulos, mensajes y publicaciones. {isMac() ? "⌘K" : "Ctrl K"} para abrir.
        </p>
      </div>
    </Modal>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-[13px] text-fg-muted">{children}</p>;
}

// Limpia el fragmento de ts_headline para mostrarlo como texto plano en
// una sola línea.
//
// Dos cosas que quitar, no una:
//
// 1. Los `<b>` del resaltado. Inyectar HTML que viene del servidor solo
//    para poner en negrita unos caracteres de 11px no vale el riesgo.
// 2. Los escapes LITERALES de JSON. El tsvector de `messages` sale de
//    `jsonb_path_query_array(...)::text`, o sea la representación JSON del
//    array: los saltos de línea del mensaje llegan como los dos caracteres
//    contrabarra + n, no como un salto real. Sin esto el usuario ve la
//    secuencia cruda en medio de la frase. Mismo motivo para las comillas
//    y corchetes del array, que también son parte de esa representación.
function stripTags(html: string): string {
  return html
    .replace(/<\/?b>/g, "")
    .replace(/\\[nrt]/g, " ")
    .replace(/^\["?|"?\]$/g, "")
    .replace(/",\s*"/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}
