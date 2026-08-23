import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { CalendarDate, parseDate, startOfMonth } from "@internationalized/date";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar.js";
import { MonthGrid } from "../components/calendar/MonthGrid.js";
import { groupByDay } from "../lib/calendar/group.js";
import { monthWeeks, rangeForDays } from "../lib/calendar/grid.js";
import { dayKey, formatMonthLabel, todayIn } from "../lib/calendar/tz.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import { parseView, type CalendarView } from "../lib/calendar/view.js";
import { useCalendarStore } from "../stores/calendar-store.js";

// Módulo Calendario (F7). Vista sobre las mismas publication_cards que
// programa el Chat — sin motor propio: reprogramar es el mismo
// POST /cards/:id/schedule que usa el drawer (PR3).
//
// Esta ruta declara `handle: { ownScroll: true }` en App.tsx: se hace cargo
// de su propio alto y de sus regiones de scroll, así que el shell apaga el
// contenedor genérico. Ver ADR-018.

export function CalendarioPage() {
  const timeZone = useTimezone();
  const [params, setParams] = useSearchParams();

  const view = parseView(params.get("v"));

  // Los CalendarDate son inmutables pero NO estables: cada render produce un
  // objeto nuevo, así que cualquier useMemo o dependencia de efecto que los
  // compare por referencia falla siempre. Todo lo que se memoriza acá se
  // ancla a la clave `YYYY-MM-DD`, que sí es un primitivo — sin esto el
  // efecto de carga volvía a pedir el mes en cada render, en bucle.
  const todayKey = dayKey(todayIn(timeZone));
  const today = useMemo(() => parseDate(todayKey), [todayKey]);

  const dayParam = params.get("d");
  const focusedDay = useMemo(
    () => parseDayParam(dayParam) ?? parseDate(todayKey),
    [dayParam, todayKey],
  );
  const monthKey = dayKey(startOfMonth(focusedDay));
  const month = useMemo(() => parseDate(monthKey), [monthKey]);

  const { cards, loading, error, load } = useCalendarStore();

  // Los días REALMENTE visibles, no el mes natural: la primera y la última
  // fila traen días del mes vecino, y si no se piden salen siempre vacíos.
  const visibleDays = useMemo(() => monthWeeks(month).flat(), [month]);
  const range = useMemo(() => rangeForDays(visibleDays, timeZone), [visibleDays, timeZone]);

  useEffect(() => {
    void load(range.from, range.to);
  }, [load, range.from, range.to]);

  const entriesByDay = useMemo(() => groupByDay(cards, timeZone), [cards, timeZone]);

  // Un solo escritor de la URL: cambiar de día puede implicar cambiar de mes
  // (flecha derecha el día 31), y eso ya lo resuelve derivar el mes del día
  // enfocado en vez de guardarlos por separado.
  const setFocusedDay = useCallback(
    (day: CalendarDate) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("d", dayKey(day));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setView = useCallback(
    (next: CalendarView) => {
      setParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          params.set("v", next);
          return params;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Atajos globales del módulo. Se ignoran mientras se escribe en un campo o
  // hay un flotante abierto con el foco adentro: T no puede robarle la tecla
  // al buscador.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;

      const shortcuts: Record<string, () => void> = {
        t: () => setFocusedDay(today),
        m: () => setView("mes"),
        s: () => setView("semana"),
        d: () => setView("dia"),
      };
      const action = shortcuts[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setFocusedDay, setView, today]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface">
      <CalendarToolbar
        view={view}
        periodLabel={formatMonthLabel(month)}
        onChangeView={setView}
        // Anclado al MES, no al día enfocado: `focusedDay.add({months:1})`
        // recorta el día al último del mes destino y el recorte no es
        // reversible — desde el 31 de agosto, ◀ ◀ ▶ devuelve el 30 de julio,
        // no el 31. El día iba derivando solo mientras el usuario navegaba.
        onPrev={() => setFocusedDay(month.subtract({ months: 1 }))}
        onNext={() => setFocusedDay(month.add({ months: 1 }))}
        onToday={() => setFocusedDay(today)}
      />

      {error && (
        <p role="alert" className="shrink-0 bg-error-bg px-5 py-2 text-[13px] text-error">
          {error}
        </p>
      )}

      {view === "mes" ? (
        <MonthGrid
          month={month}
          today={today}
          focusedDay={focusedDay}
          entriesByDay={entriesByDay}
          timeZone={timeZone}
          onFocusDay={setFocusedDay}
          onSelectDay={setFocusedDay}
        />
      ) : (
        // Semana y Día llegan en PR4. La vista se puede seleccionar desde ya
        // porque el segmented control y el estado en la URL son de PR1: es
        // más honesto mostrar el hueco que deshabilitar dos pestañas y tener
        // que volver a tocar la toolbar después.
        <div className="flex min-h-0 flex-1 items-center justify-center px-8">
          <p className="text-center text-[13px] text-fg-muted">
            La vista {view === "semana" ? "semana" : "día"} llega en el siguiente avance del módulo.
          </p>
        </div>
      )}

      {/* Indicador de carga discreto: la grilla conserva el contenido
          anterior mientras llega el mes nuevo (calendar-store), así que esto
          reemplaza al skeleton y evita el parpadeo a vacío. */}
      <div
        aria-live="polite"
        className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2"
      >
        {loading && (
          <span className="rounded-full border border-line bg-card px-3 py-1 text-[11px] text-fg-muted shadow-sm">
            Cargando…
          </span>
        )}
      </div>
    </div>
  );
}

function parseDayParam(value: string | null): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    // Una URL editada a mano no debe romper el módulo: cae a hoy.
    return null;
  }
}
