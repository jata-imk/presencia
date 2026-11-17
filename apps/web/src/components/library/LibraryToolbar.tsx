import { Check, ChevronDown, LayoutGrid, List, Search, X } from "lucide-react";
import {
  NETWORK_LABELS,
  type LibraryCardStatus,
  type LibraryOrigin,
  type SocialNetwork,
} from "@presencia/shared";
import { MENU_ITEM_CLASS, Menu } from "../ui/Menu.js";
import { Tooltip } from "../ui/Tooltip.js";
import {
  NO_FILTERS,
  ORIGIN_LABELS,
  STATUS_LABELS,
  hasFilters,
  withFilter,
  type LibraryFilters,
} from "../../lib/library/library.js";

// La barra de herramientas de Biblioteca (F12, Claude Design "Presencia -
// Biblioteca" §02): buscador, filtros en píldora con menú y el cambio entre
// cuadrícula y lista. Sin selector de orden: lo más nuevo va arriba, siempre
// (`presencia-biblioteca.md` §3).

export type LibraryView = "grid" | "list";

interface Option<T extends string> {
  value: T;
  label: string;
}

// Las redes que publican imagen fija. TikTok y YouTube son de video: ninguna
// imagen de Biblioteca puede estar en una card suya.
const NETWORKS: SocialNetwork[] = ["instagram", "facebook", "linkedin", "x", "threads"];

const ORIGIN_OPTIONS: Option<LibraryOrigin>[] = [
  { value: "generated", label: ORIGIN_LABELS.generated },
  { value: "uploaded", label: ORIGIN_LABELS.uploaded },
];
const NETWORK_OPTIONS: Option<SocialNetwork>[] = NETWORKS.map((value) => ({
  value,
  label: NETWORK_LABELS[value],
}));
const STATUS_OPTIONS: Option<LibraryCardStatus>[] = (
  ["draft", "scheduled", "published"] as const
).map((value) => ({ value, label: STATUS_LABELS[value] }));
const STATE_OPTIONS: Option<"chosen" | "discarded">[] = [
  { value: "chosen", label: "Elegidas" },
  { value: "discarded", label: "Descartadas" },
];

const CHIP_BASE =
  "flex h-8 items-center rounded-full border font-display text-sm font-medium whitespace-nowrap transition-colors";
const CHIP_ON = "border-accent bg-tint-plum text-brand";
const CHIP_OFF = "border-line bg-card text-fg-secondary hover:border-accent";

function ClearChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Quitar filtro: ${label}`}
      onClick={onClear}
      className="mr-1.5 flex size-5 items-center justify-center rounded-full hover:bg-card"
    >
      <X size={13} aria-hidden />
    </button>
  );
}

/** Una píldora de filtro. Encendida muestra su valor y una ✕ que lo quita. */
function FilterChip<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T | null) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu placement="bottom-start">
      <div className={`${CHIP_BASE} ${current ? CHIP_ON : CHIP_OFF}`}>
        <Menu.Trigger
          aria-label={current ? `${label}: ${current.label}` : label}
          className={`flex h-full items-center gap-1.5 rounded-full pl-3 ${current ? "pr-1.5" : "pr-2.5"}`}
        >
          {current ? current.label : label}
          {!current && <ChevronDown size={13} className="text-fg-muted" aria-hidden />}
        </Menu.Trigger>
        {current && <ClearChip label={current.label} onClear={() => onChange(null)} />}
      </div>
      <Menu.Content className="min-w-[200px] rounded-lg border border-line bg-card p-1.5 shadow-lg outline-none">
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            // Elegir la que ya está puesta la quita, como en el diseño.
            onClick={() => onChange(option.value === value ? null : option.value)}
            className={`${MENU_ITEM_CLASS} whitespace-nowrap`}
          >
            <span className="flex w-4 shrink-0 text-accent">
              {option.value === value && <Check size={15} aria-hidden />}
            </span>
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
}

function ViewToggle({
  view,
  onChange,
  className,
}: {
  view: LibraryView;
  onChange: (view: LibraryView) => void;
  className: string;
}) {
  const buttons = [
    { value: "grid" as const, label: "Cuadrícula", Icon: LayoutGrid },
    { value: "list" as const, label: "Lista", Icon: List },
  ];
  return (
    <div
      role="group"
      aria-label="Vista"
      className={`shrink-0 rounded-md border border-line bg-secondary p-0.5 ${className}`}
    >
      {buttons.map(({ value, label, Icon }) => (
        <Tooltip key={value} label={label}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={view === value}
            onClick={() => onChange(value)}
            className={`flex h-[38px] w-10 items-center justify-center rounded-[6px] transition-colors @lg:h-[30px] @lg:w-8 ${
              view === value ? "bg-card text-brand shadow-md" : "text-fg-muted hover:text-fg"
            }`}
          >
            <Icon size={16} aria-hidden />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export function LibraryToolbar({
  search,
  onSearch,
  filters,
  onFilters,
  view,
  onView,
}: {
  search: string;
  onSearch: (text: string) => void;
  filters: LibraryFilters;
  onFilters: (filters: LibraryFilters) => void;
  view: LibraryView;
  onView: (view: LibraryView) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-3 @lg:px-6 @lg:pb-4 @4xl:px-8">
      {/* El buscador parte de 220 y crece hasta 360: así, cuando el espacio
          aprieta (sidebar ancho, drawer abierto), se encoge él antes de que
          el cambio de vista se caiga a otro renglón. */}
      <div className="flex min-w-0 flex-[1_1_100%] items-center gap-2 @lg:max-w-[360px] @lg:flex-[1_1_220px]">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-secondary px-3 focus-within:border-line-focus @lg:h-9">
          <Search size={15} className="shrink-0 text-fg-muted" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            aria-label="Buscar en tu Biblioteca"
            placeholder="Busca por prompt, texto alternativo o chat"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
          />
          {search && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => onSearch("")}
              className="flex shrink-0 text-fg-muted hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        <ViewToggle view={view} onChange={onView} className="flex @lg:hidden" />
      </div>
      {/* Base `auto`: si las píldoras no caben junto al buscador bajan
          enteras a su renglón, en vez de apretarse en una columna. Sin
          crecer, para que el espacio libre sea del buscador. */}
      <div className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2 @lg:flex-[0_1_auto]">
        <FilterChip
          label="Origen"
          value={filters.origin}
          options={ORIGIN_OPTIONS}
          onChange={(value) => onFilters(withFilter(filters, "origin", value))}
        />
        <FilterChip
          label="Red"
          value={filters.network}
          options={NETWORK_OPTIONS}
          onChange={(value) => onFilters(withFilter(filters, "network", value))}
        />
        <FilterChip
          label="Estado de la card"
          value={filters.cardStatus}
          options={STATUS_OPTIONS}
          onChange={(value) => onFilters(withFilter(filters, "cardStatus", value))}
        />
        <FilterChip
          label="Elegidas / Descartadas"
          value={filters.state}
          options={STATE_OPTIONS}
          onChange={(value) => onFilters(withFilter(filters, "state", value))}
        />
        {/* El atajo del bento no tiene menú: es una píldora que solo se quita. */}
        {filters.generatedSince && (
          <div className={`${CHIP_BASE} ${CHIP_ON} pl-3`}>
            <span className="pr-1.5">Generadas esta semana</span>
            <ClearChip
              label="Generadas esta semana"
              onClear={() => onFilters(withFilter(filters, "generatedSince", null))}
            />
          </div>
        )}
        {hasFilters(filters) && (
          <button
            type="button"
            onClick={() => onFilters(NO_FILTERS)}
            className="px-1 text-sm text-accent hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <ViewToggle view={view} onChange={onView} className="ml-auto hidden @lg:flex" />
    </div>
  );
}
