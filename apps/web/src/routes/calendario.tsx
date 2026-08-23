import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AnimatePresence } from "motion/react";
import { CalendarDate, parseDate, startOfMonth } from "@internationalized/date";
import type { PublicationCardDto } from "@presencia/shared";
import { CadenceBar } from "../components/calendar/CadenceBar.js";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar.js";
import { CardModal } from "../components/calendar/CardModal.js";
import { DayPanel } from "../components/calendar/DayPanel.js";
import type { DayCardActions } from "../components/calendar/DayPanelCard.js";
import { MonthGrid } from "../components/calendar/MonthGrid.js";
import { ApiError } from "../lib/api.js";
import { cancelCardSchedule, rescheduleCard } from "../lib/cards-api.js";
import { groupByDay } from "../lib/calendar/group.js";
import { monthWeeks, rangeForDays } from "../lib/calendar/grid.js";
import { dayKey, formatMonthLabel, todayIn } from "../lib/calendar/tz.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import { parseView, type CalendarView } from "../lib/calendar/view.js";
import { useCalendarStore } from "../stores/calendar-store.js";
import { useScheduleDrawerStore } from "../stores/schedule-drawer-store.js";
import { useToastStore } from "../stores/toast-store.js";

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
  const navigate = useNavigate();
  const openDrawer = useScheduleDrawerStore((s) => s.open);
  const toast = useToastStore((s) => s.show);

  // Qué está abierto encima de la grilla. El día seleccionado NO es lo mismo
  // que el día enfocado: el foco lo mueven las flechas sin abrir nada, y el
  // panel solo aparece al elegir un día a propósito (click o Enter).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [modalCardIds, setModalCardIds] = useState<string[] | null>(null);

  // Deep-link "Ver en calendario" desde una card de Chat: abre el panel de
  // ese día y resalta la publicación. El parámetro se consume una sola vez y
  // se limpia de la URL — si quedara, cerrar el panel y volver a abrir el
  // mismo día lo re-resaltaría sin que nadie lo haya pedido.
  const cardParam = params.get("card");
  const dayParamForCard = params.get("d");
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!cardParam) return;
    if (dayParamForCard) setSelectedKey(dayParamForCard);
    setHighlightedCardId(cardParam);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("card");
        return next;
      },
      { replace: true },
    );
  }, [cardParam, dayParamForCard, setParams]);

  // El temporizador va en su PROPIO efecto. Dentro del de arriba se
  // cancelaba solo: ese efecto borra `card` de la URL, así que `cardParam`
  // pasa a null, cambian sus deps, React corre el cleanup (clearTimeout) y
  // el re-run sale por el early return. El resaltado se quedaba pegado para
  // siempre — y el propio comentario decía que se limpiaba.
  useEffect(() => {
    if (!highlightedCardId) return;
    const timer = window.setTimeout(() => setHighlightedCardId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightedCardId]);

  // Los días REALMENTE visibles, no el mes natural: la primera y la última
  // fila traen días del mes vecino, y si no se piden salen siempre vacíos.
  const visibleDays = useMemo(() => monthWeeks(month).flat(), [month]);
  const range = useMemo(() => rangeForDays(visibleDays, timeZone), [visibleDays, timeZone]);
  const todayIsVisible = useMemo(
    () => visibleDays.some((day) => day.compare(today) === 0),
    [visibleDays, today],
  );

  useEffect(() => {
    void load(range.from, range.to);
  }, [load, range.from, range.to]);

  const entriesByDay = useMemo(() => groupByDay(cards, timeZone), [cards, timeZone]);

  const selectedDay = useMemo(() => parseDayParam(selectedKey), [selectedKey]);
  // Las cards del modal se releen del store por id en cada render, no se
  // guardan como snapshot: así reprogramar o cancelar desde el propio modal
  // se refleja adentro sin cerrarlo ni sincronizar dos copias.
  const modalCards = useMemo(
    () => (modalCardIds ? cards.filter((card) => modalCardIds.includes(card.id)) : []),
    [cards, modalCardIds],
  );

  const reload = useCallback(() => load(range.from, range.to), [load, range.from, range.to]);

  const actions = useMemo<DayCardActions>(
    () => ({
      onView: (card) => {
        // Un grupo multi-red se abre entero para que el selector de redes
        // del modal tenga con qué comparar.
        const siblings =
          card.groupId && card.scheduledAt
            ? cards.filter(
                (other) => other.groupId === card.groupId && other.scheduledAt === card.scheduledAt,
              )
            : [card];
        setModalCardIds(siblings.map((c) => c.id));
      },
      onEditInChat: (card) => {
        if (card.chatId) void navigate(`/chats/${card.chatId}`);
      },
      onReschedule: (target) => {
        // El preset es el horario que la card YA tiene: reprogramar es
        // mover desde donde está, no empezar de cero.
        //
        // `new Date(iso)` y no la conversión a la zona del usuario a
        // propósito: el drawer entero trabaja en hora del navegador
        // (components/schedule/date-utils.ts, hueco conocido de F6). Pasarle
        // un Date "falso" con la hora de pared del usuario haría que se VEA
        // bien y que al confirmar sin tocar nada escribiera un instante
        // DISTINTO — peor que la inconsistencia visual. Así el viaje de ida
        // y vuelta es exacto. Volver tz-aware al drawer toca también el
        // Chat; va en su propio PR.
        const first = target[0];
        openDrawer(target, {
          presetDate: first?.scheduledAt ? new Date(first.scheduledAt) : null,
          onDone: () => void reload(),
        });
      },
      onCancel: (target) => {
        void cancelMany(target, { reload, toast });
      },
    }),
    [cards, navigate, openDrawer, reload, toast],
  );

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
      // `instanceof Element` y no un cast: el target de un keydown es
      // normalmente el elemento con foco, pero no está garantizado, y
      // llamar .closest() sobre document o window revienta el handler
      // entero — con él, todos los atajos del módulo.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      // Con el modal abierto el contexto es la publicación, no el
      // calendario: "d" no debe cambiar de vista por detrás del diálogo.
      if (target?.closest('[role="dialog"]')) return;

      // Escape con un solo dueño y un orden explícito: primero lo de más
      // arriba. El modal cierra por su cuenta (useDialog), así que acá solo
      // hace falta NO cerrar además el panel — si los dos escucharan en
      // `document` sin coordinarse, un Escape se llevaría los dos por
      // delante y dejaría al usuario en la grilla pelada. Por eso
      // use-inspector.ts tiene escapeKey desactivado.
      if (event.key === "Escape") {
        if (modalCardIds) return;
        if (selectedKey) {
          event.preventDefault();
          setSelectedKey(null);
        }
        return;
      }

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
  }, [modalCardIds, selectedKey, setFocusedDay, setView, today]);

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

      {/* Solo en mes y semana: en vista día, medir cadencia semanal es ruido. */}
      {view !== "dia" && (
        <CadenceBar
          cards={cards}
          // `cards` solo tiene el rango cargado. Si el usuario navegó a
          // diciembre, la semana de HOY no está ahí y la barra diría "nada
          // programado esta semana", que es falso. Cuando hoy no está a la
          // vista se ancla al mes visible, que sí está cargado: el conteo
          // deja de ser "esta semana" pero nunca es mentira.
          weekOf={view === "mes" ? (todayIsVisible ? today : month) : focusedDay}
          today={today}
          timeZone={timeZone}
        />
      )}

      {view === "mes" ? (
        <MonthGrid
          month={month}
          today={today}
          focusedDay={focusedDay}
          entriesByDay={entriesByDay}
          timeZone={timeZone}
          onFocusDay={setFocusedDay}
          onSelectDay={(day) => {
            setFocusedDay(day);
            setSelectedKey(dayKey(day));
          }}
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

      <AnimatePresence>
        {selectedDay && (
          <DayPanel
            key={selectedKey}
            day={selectedDay}
            today={today}
            entries={entriesByDay.get(dayKey(selectedDay)) ?? []}
            timeZone={timeZone}
            actions={actions}
            highlightedCardId={highlightedCardId}
            onClose={() => setSelectedKey(null)}
            onCreate={() => void navigate(`/chats?fecha=${dayKey(selectedDay)}`)}
          />
        )}
      </AnimatePresence>

      {modalCards.length > 0 && (
        <CardModal cards={modalCards} actions={actions} onClose={() => setModalCardIds(null)} />
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

/**
 * Cancela la programación de una o varias cards y ofrece deshacer durante
 * 5 s. Sin modal de confirmación a propósito: cancelar es reversible y de
 * bajo impacto, y el nivel de fricción se ajusta al nivel de impacto
 * (presencia-calendario.md §6 — eliminar un borrador, que no es reversible,
 * sí lleva confirmación). Misma técnica que ya usa la card en Chat.
 */
async function cancelMany(
  target: PublicationCardDto[],
  {
    reload,
    toast,
  }: {
    reload: () => Promise<void>;
    toast: (options: { title: string; description?: string; onUndo?: () => void }) => void;
  },
): Promise<void> {
  // El horario previo se guarda ANTES de cancelar: cancelSchedule limpia
  // scheduled_at y social_account_id en la fila, así que después de la
  // llamada ya no hay a dónde volver.
  const previous = target
    .filter((card) => card.socialAccountId && card.scheduledAt)
    .map((card) => ({
      id: card.id,
      socialAccountId: card.socialAccountId!,
      scheduledAt: card.scheduledAt!,
    }));

  try {
    await Promise.all(target.map((card) => cancelCardSchedule(card.id)));
  } catch (error) {
    toast({
      title: error instanceof ApiError ? error.message : "No se pudo cancelar la programación.",
    });
    await reload();
    return;
  }
  await reload();

  // Deshacer solo si se pueden restaurar TODAS. Una card `scheduled`
  // siempre tiene cuenta y horario (los pone markScheduling), así que el
  // caso contrario no debería existir — pero si existe, ofrecer "Deshacer"
  // y restaurar solo una parte es peor que no ofrecerlo: el usuario cree
  // que volvió atrás y no del todo.
  const canUndoAll = previous.length === target.length;

  toast({
    title:
      target.length === 1
        ? "Programación cancelada"
        : `${String(target.length)} programaciones canceladas`,
    description: target.length === 1 ? "Vuelve a borrador." : "Vuelven a borrador.",
    onUndo:
      canUndoAll && previous.length > 0
        ? () => {
            Promise.all(
              previous.map((card) =>
                rescheduleCard(card.id, {
                  socialAccountId: card.socialAccountId,
                  scheduledAt: card.scheduledAt,
                }),
              ),
            )
              .then(reload)
              .catch((error: unknown) => {
                toast({
                  title:
                    error instanceof ApiError
                      ? error.message
                      : "No se pudo deshacer — ese horario ya no es válido.",
                });
                return reload();
              });
          }
        : undefined,
  });
}
