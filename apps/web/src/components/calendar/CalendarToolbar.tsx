import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { Link } from "react-router";
import type { FolderDto } from "@presencia/shared";
import type { CalendarFilters } from "../../lib/cards-api.js";
import { FiltersMenu } from "./FiltersMenu.js";
import type { CalendarView } from "../../lib/calendar/view.js";

// Toolbar del módulo (presencia-calendario.md §3), de izquierda a derecha:
// selector de vista, navegador temporal, "Hoy", Filtros y "+ Crear".
//
// "+ Crear" abre un chat nuevo SIN fecha precargada — es el atajo
// equivalente a "Nuevo chat" del sidebar. La fecha solo se precarga desde
// "+ Crear para este día" del panel del día: el Calendario decide el día y
// el Chat decide la hora, cada módulo con su responsabilidad
// (presencia-calendario.md §3).
//
// Filtros abre un popover y no un panel fijo: la mayor parte del tiempo nadie
// filtra, y un panel permanente sería ancho gastado (§3).

const VIEWS: { value: CalendarView; label: string; hint: string }[] = [
  { value: "mes", label: "Mes", hint: "Vista mes (M)" },
  { value: "semana", label: "Semana", hint: "Vista semana (S)" },
  { value: "dia", label: "Día", hint: "Vista día (D)" },
];

interface CalendarToolbarProps {
  view: CalendarView;
  periodLabel: string;
  onChangeView: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  filters: CalendarFilters;
  activeFilterCount: number;
  folders: FolderDto[];
  onChangeFilters: (next: CalendarFilters) => void;
  /**
   * Solo abajo de 768px: ahí la bandeja de borradores no cabe como columna
   * y se abre desde acá como hoja inferior. En escritorio va como `undefined`
   * y el botón no se renderiza — la bandeja ya está a la vista.
   */
  onOpenDrafts?: () => void;
  draftCount?: number;
}

export function CalendarToolbar({
  view,
  periodLabel,
  onChangeView,
  onPrev,
  onNext,
  onToday,
  filters,
  activeFilterCount,
  folders,
  onChangeFilters,
  onOpenDrafts,
  draftCount = 0,
}: CalendarToolbarProps) {
  // overflow-x + shrink-0 en cada control: la toolbar tiene un ancho mínimo
  // real (~715px) y abajo de eso el contenido se recortaba sin forma de
  // alcanzarlo — "Hoy" y "Crear" quedaban fuera de la pantalla a 390px. Sin
  // el shrink-0 los hijos se comprimen en vez de desbordar, y el scroll no
  // llega a activarse. Scroll horizontal es lo que hace el mock de mobile
  // con esta misma barra; el eje horizontal de una tira de controles no
  // cuenta contra la regla de un solo eje VERTICAL por región (ADR-014).
  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-card px-5 py-2.5">
      <div
        role="tablist"
        aria-label="Vista del calendario"
        className="inline-flex shrink-0 gap-0.5 rounded-lg border border-line bg-secondary p-0.5"
      >
        {VIEWS.map((option) => {
          const active = option.value === view;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              title={option.hint}
              onClick={() => onChangeView(option.value)}
              className={`shrink-0 rounded-md px-4 py-1.5 font-display text-[13px] transition-colors ${
                active
                  ? "bg-card font-semibold text-brand shadow-xs"
                  : "font-medium text-fg-secondary hover:text-brand"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Periodo anterior"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary hover:text-brand"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        {/* aria-live: al navegar con teclado, el único cambio anunciable es
            esta etiqueta — sin esto el lector de pantalla no dice a qué mes
            se movió. */}
        <span
          aria-live="polite"
          className="min-w-[132px] shrink-0 text-center font-display text-[17px] font-semibold text-fg"
        >
          {periodLabel}
        </span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Periodo siguiente"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary hover:text-brand"
        >
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        onClick={onToday}
        title="Ir a hoy (T)"
        className="shrink-0 rounded-lg border-[1.5px] border-line bg-card px-3.5 py-1.5 font-display text-[13px] font-semibold text-fg-secondary transition-colors hover:border-line-focus hover:bg-secondary hover:text-brand"
      >
        Hoy
      </button>

      <div className="w-3 flex-1" />

      {onOpenDrafts && (
        <button
          type="button"
          onClick={onOpenDrafts}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-line bg-card px-3 font-display text-[13px] font-semibold text-fg-secondary transition-colors hover:border-line-focus hover:text-brand"
        >
          <FileText size={15} strokeWidth={1.75} />
          Borradores
          {draftCount > 0 && (
            <span className="rounded-full bg-accent-cta px-1.5 font-display text-[10px] font-bold text-accent-cta-fg">
              {draftCount}
            </span>
          )}
        </button>
      )}

      <FiltersMenu
        filters={filters}
        activeCount={activeFilterCount}
        folders={folders}
        onChange={onChangeFilters}
      />
      <Link
        to="/chats"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-display text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Plus size={15} strokeWidth={2.5} />
        Crear
      </Link>
    </div>
  );
}
