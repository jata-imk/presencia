import { Check, SlidersHorizontal, X } from "lucide-react";
import type { CardStatus, FolderDto, SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Menu } from "../ui/Menu.js";
import type { CalendarFilters } from "../../lib/cards-api.js";
import { FILTERABLE_STATUSES, STATUS_LABEL } from "../../lib/calendar/filters.js";

// Popover de filtros (presencia-calendario.md §3): carpeta, red y estado.
//
// Popover y no panel fijo porque la mayor parte del tiempo nadie filtra, y un
// panel permanente sería ancho gastado. El contador en el botón ("Filtros ·
// 2") es lo que da visibilidad de que hay algo activo sin ocupar espacio.
//
// Es `Menu` y no `Modal`: el fondo tiene que seguir interactivo para poder
// ver la grilla cambiar mientras se marcan opciones (ADR-015 — la distinción
// es la interacción de fondo, no si hay portal).

const ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-secondary-hover";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-1.5 first:border-t-0 first:pt-0">
      <p className="px-2.5 pt-1 pb-1 font-display text-[10px] font-bold tracking-wider text-fg-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function Option({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  // Menu.Item y no un <button> suelto: los items se registran en el listRef
  // de use-menu, que es de donde useListNavigation saca las flechas. Con
  // botones propios el menú se abría con `role="menu"` y una lista vacía —
  // ↑/↓ no hacían nada y las opciones solo se alcanzaban con el mouse.
  return (
    <Menu.Item checked={checked} onClick={onToggle} className={ROW}>
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
          checked ? "border-primary bg-primary text-primary-fg" : "border-line-focus"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {children}
    </Menu.Item>
  );
}

export function FiltersMenu({
  filters,
  activeCount,
  folders,
  onChange,
}: {
  filters: CalendarFilters;
  activeCount: number;
  folders: FolderDto[];
  onChange: (next: CalendarFilters) => void;
}) {
  const toggle = <T extends string>(list: T[] | undefined, value: T): T[] | undefined => {
    const current = list ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    // Sin ninguno marcado el filtro deja de existir: "cero redes" y "todas
    // las redes" tienen que verse igual, o el calendario quedaría vacío por
    // haber desmarcado la última casilla.
    return next.length > 0 ? next : undefined;
  };

  return (
    <Menu placement="bottom-end">
      <Menu.Trigger
        aria-label={activeCount > 0 ? `Filtros, ${String(activeCount)} activos` : "Filtros"}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] px-3.5 py-1.5 font-display text-[13px] font-semibold transition-colors ${
          activeCount > 0
            ? "border-line-focus bg-secondary text-brand"
            : "border-line bg-card text-fg-secondary hover:border-line-focus hover:bg-secondary hover:text-brand"
        }`}
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} />
        Filtros
        {activeCount > 0 && <span className="text-accent">· {activeCount}</span>}
      </Menu.Trigger>

      <Menu.Content className="flex w-60 flex-col gap-1.5 rounded-xl border border-line bg-card p-1.5 shadow-lg outline-none">
        {folders.length > 0 && (
          <Group title="Carpeta">
            {folders.map((folder) => (
              <Option
                key={folder.id}
                checked={filters.folderId === folder.id}
                onToggle={() =>
                  onChange({
                    ...filters,
                    // Una sola carpeta a la vez: el CM mira el pipeline de UN
                    // cliente, no la unión de varios.
                    folderId: filters.folderId === folder.id ? undefined : folder.id,
                  })
                }
              >
                <span className="truncate">
                  {folder.icon ? `${folder.icon} ` : ""}
                  {folder.name}
                </span>
              </Option>
            ))}
          </Group>
        )}

        <Group title="Red social">
          {(Object.keys(NETWORK_META) as SocialNetwork[]).map((network) => {
            const meta = NETWORK_META[network];
            return (
              <Option
                key={network}
                checked={filters.network?.includes(network) ?? false}
                onToggle={() => onChange({ ...filters, network: toggle(filters.network, network) })}
              >
                <meta.Logo size={13} />
                <span>{meta.label}</span>
              </Option>
            );
          })}
        </Group>

        <Group title="Estado">
          {FILTERABLE_STATUSES.map((status) => (
            <Option
              key={status}
              checked={filters.status?.includes(status) ?? false}
              onToggle={() =>
                onChange({ ...filters, status: toggle(filters.status, status as CardStatus) })
              }
            >
              <span>{STATUS_LABEL[status]}</span>
            </Option>
          ))}
        </Group>

        {activeCount > 0 && (
          <Menu.Item
            onClick={() => onChange({})}
            // text-fg-secondary y no fg-muted: en oscuro, fg-muted (#6b5a78) contra
            // la superficie del menú (#1a0f20) da 2.9:1 — abajo del 4.5:1 de AA
            // para un control real. fg-secondary da ~8.9:1.
            className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg border-t border-line py-2 font-display text-[12px] font-semibold text-fg-secondary transition-colors hover:bg-secondary hover:text-brand"
          >
            <X size={13} strokeWidth={2} />
            Quitar los filtros
          </Menu.Item>
        )}
      </Menu.Content>
    </Menu>
  );
}
