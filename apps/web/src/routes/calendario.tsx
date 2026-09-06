import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AnimatePresence } from "motion/react";
import {
  CalendarDate,
  parseDate,
  startOfMonth,
  toCalendarDate,
  type ZonedDateTime,
} from "@internationalized/date";
import type { PublicationCardDto } from "@presencia/shared";
import { CadenceBar } from "../components/calendar/CadenceBar.js";
import { ConflictDialog } from "../components/calendar/ConflictDialog.js";
import { DragGhost } from "../components/calendar/DragGhost.js";
import { DayTimeline } from "../components/calendar/DayTimeline.js";
import { DraftsPanel } from "../components/calendar/DraftsPanel.js";
import {
  CalendarSkeleton,
  EmptyByFiltersState,
  EmptyPeriodState,
  FirstTimeState,
  DisconnectedChannelsBanner,
  OfflineBanner,
} from "../components/calendar/CalendarStates.js";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar.js";
import { CardModal } from "../components/calendar/CardModal.js";
import { DayPanel } from "../components/calendar/DayPanel.js";
import type { DayCardActions } from "../components/calendar/DayPanelCard.js";
import { MonthGrid } from "../components/calendar/MonthGrid.js";
import { WeekGrid } from "../components/calendar/WeekGrid.js";
import { ApiError } from "../lib/api.js";
import { type CalendarFilters, cancelCardSchedule, rescheduleCard } from "../lib/cards-api.js";
import { filterDrafts, parseFilters, writeFilters } from "../lib/calendar/filters.js";
import { groupByDay } from "../lib/calendar/group.js";
import {
  conflictDays as conflictDaysOf,
  existingConflicts,
  movedToDay,
  suggestLater,
  verdictFor,
} from "../lib/calendar/schedule-move.js";
import { instantAt, minutesFromOffset } from "../lib/calendar/timeline.js";
import { useDragSchedule } from "../lib/calendar/use-drag-schedule.js";
import { monthWeeks, rangeForDays, weekDays } from "../lib/calendar/grid.js";
import {
  dayKey,
  formatDayLong,
  formatMonthLabel,
  formatTime,
  todayIn,
  zonedFromIso,
} from "../lib/calendar/tz.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import { parseView, type CalendarView } from "../lib/calendar/view.js";
import { useChannels } from "../lib/use-channels.js";
import { useMediaQuery } from "../lib/use-media-query.js";
import { useCalendarStore } from "../stores/calendar-store.js";
import { useFoldersStore } from "../stores/folders-store.js";
import { useChatsStore } from "../stores/chats-store.js";
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
  const { activeCount, ...filters } = parseFilters(params);
  // Clave estable de los filtros: el objeto es nuevo en cada render y las
  // dependencias de efecto lo compararían por referencia, recargando en bucle.
  const filtersKey = `${filters.status?.join(",") ?? ""}|${filters.network?.join(",") ?? ""}|${filters.folderId ?? ""}`;

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

  const periodLabel = useMemo(() => {
    if (view === "mes") return formatMonthLabel(month);
    if (view === "dia") return formatDayLong(focusedDay);
    // Semana: "24 – 30 de agosto", y con los dos meses cuando la cruza.
    const days = weekDays(focusedDay);
    const first = days[0]!;
    const last = days[6]!;
    return first.month === last.month
      ? `${String(first.day)} – ${String(last.day)} de ${monthNameOf(last)}`
      : `${String(first.day)} de ${monthNameOf(first)} – ${String(last.day)} de ${monthNameOf(last)}`;
  }, [focusedDay, month, view]);

  const { cards, drafts, loading, error, load, loadDrafts, upsert } = useCalendarStore();
  const navigate = useNavigate();
  const openDrawer = useScheduleDrawerStore((s) => s.open);
  const { disconnectedChannels, refreshDisconnected } = useChannels();
  // Solo para distinguir "cuenta nueva" de "periodo vacío" (ver emptyState).
  // El sidebar ya lo carga en cada pantalla autenticada, así que acá no se
  // pide nada: se lee el store que ya existe.
  const chats = useChatsStore((state) => state.chats);

  // El fetch de desconectadas es perezoso en useChannels (no se pide en cada
  // montaje). El Calendario sí lo necesita: es donde se ve lo que está por
  // publicarse.
  useEffect(() => {
    refreshDisconnected();
  }, [refreshDisconnected]);
  const toast = useToastStore((s) => s.show);

  // Qué está abierto encima de la grilla. El día seleccionado NO es lo mismo
  // que el día enfocado: el foco lo mueven las flechas sin abrir nada, y el
  // panel solo aparece al elegir un día a propósito (click o Enter).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Abajo de 768px la bandeja de borradores se abre como hoja desde la
  // toolbar en vez de vivir como columna (ver DraftsPanel).
  const [draftsSheetOpen, setDraftsSheetOpen] = useState(false);
  const [modalCardIds, setModalCardIds] = useState<string[] | null>(null);
  // Igual que el sidebar del shell (sidebar-store.ts): lo que se guarda es
  // la decisión del usuario, no el estado efectivo. `null` = "no elegí" →
  // manda el viewport, y entre 768 y 1023px la bandeja arranca como rail:
  // con 300px fijos las celdas del mes bajan de ~66px de ancho y las pills
  // dejan de leerse.
  const [userDraftsCollapsed, setUserDraftsCollapsed] = useState<boolean | null>(null);
  const [flashDay, setFlashDay] = useState<string | null>(null);
  // Solo el instante, no el día: en semana el destino sale del punto exacto
  // donde se soltó, y el día de aterrizaje se deriva de la SUGERENCIA (+30
  // min puede cruzar la medianoche). Guardar el día además sería un dato que
  // nadie lee y que el próximo lector creería autoritativo.
  const [conflict, setConflict] = useState<{
    cards: PublicationCardDto[];
    /** La red del grupo que choca, que no siempre es la primera. */
    network: PublicationCardDto["network"];
    at: ZonedDateTime;
  } | null>(null);

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

  // Los días REALMENTE visibles según la vista. En mes son las 5-6 semanas
  // completas (la primera y la última fila traen días del mes vecino, y si no
  // se piden salen siempre vacíos); en semana son 7; en día, uno.
  const visibleDays = useMemo(() => {
    if (view === "semana") return weekDays(focusedDay);
    if (view === "dia") return [focusedDay];
    return monthWeeks(month).flat();
  }, [focusedDay, month, view]);
  const range = useMemo(() => rangeForDays(visibleDays, timeZone), [visibleDays, timeZone]);
  const todayIsVisible = useMemo(
    () => visibleDays.some((day) => day.compare(today) === 0),
    [visibleDays, today],
  );

  useEffect(() => {
    void load(range.from, range.to, filters);
    // Depende de filtersKey y no de `filters`: el objeto es nuevo en cada
    // render y compararlo por referencia recargaría en bucle. La clave cambia
    // exactamente cuando cambia algún filtro.
  }, [load, range.from, range.to, filtersKey]);

  // Los borradores no dependen del rango visible (no tienen fecha), así que
  // se piden una sola vez al entrar y se refrescan cuando uno cruza a
  // programado.
  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const entriesByDay = useMemo(() => groupByDay(cards, timeZone), [cards, timeZone]);

  // Redes con posts programados en el periodo visible pero sin cuenta activa
  // en Configuración. Se calcula contra las cuentas activas (GET /channels ya
  // excluye las desconectadas) y no contra la lista de desconectadas: una red
  // que nunca se conectó falla igual de feo cuando llegue la hora, y ese caso
  // no aparecería en /channels/disconnected.
  // Se pregunta por las CUENTAS desconectadas y no por las cards del rango:
  // `cards` viene filtrado del servidor, así que marcar el filtro "Borrador"
  // —o entrar por un link ya filtrado— hacía desaparecer el aviso aunque el
  // problema siguiera igual de roto. Además una red que nunca se conectó no
  // puede tener nada programado (programar exige `social_account_id`), así
  // que la lista de desconectadas es la pregunta correcta y completa.
  const disconnectedNetworks = useMemo(
    () => [...new Set((disconnectedChannels ?? []).map((account) => account.network))],
    [disconnectedChannels],
  );

  // Los borradores se filtran en el cliente: no tienen fecha, así que el
  // endpoint de rango no los devuelve, y son pocos por definición. El filtro
  // de carpeta no aplica —el DTO trae el chat, no la carpeta— y se ignora en
  // vez de vaciar la bandeja en falso.
  const visibleDrafts = useMemo(() => filterDrafts(drafts, filters), [drafts, filtersKey]);

  const selectedDay = useMemo(() => parseDayParam(selectedKey), [selectedKey]);
  // Las cards del modal se releen del store por id en cada render, no se
  // guardan como snapshot: así reprogramar o cancelar desde el propio modal
  // se refleja adentro sin cerrarlo ni sincronizar dos copias.
  const modalCards = useMemo(
    () => (modalCardIds ? cards.filter((card) => modalCardIds.includes(card.id)) : []),
    [cards, modalCardIds],
  );

  const reload = useCallback(async () => {
    await Promise.all([load(range.from, range.to, filters), loadDrafts()]);
  }, [load, loadDrafts, range.from, range.to, filtersKey]);

  // Sin `replace`: cada cambio de filtro empuja una entrada de historial,
  // que es lo que hace que el back del navegador deshaga UN filtro en vez de
  // sacarte del módulo. Es la única parte del estado de la URL que se
  // comporta así — vista y día se reemplazan, porque ahí el back tiene que
  // devolverte a la pantalla anterior, no a la celda anterior.
  const setFilters = useCallback(
    (next: CalendarFilters) => {
      setParams((previous) => writeFilters(new URLSearchParams(previous), next));
    },
    [setParams],
  );

  // ── Arrastrar para reprogramar ─────────────────────────────────────
  const conflictDays = useMemo(() => conflictDaysOf(cards, timeZone), [cards, timeZone]);
  // Los mismos choques, por id: la vista mes los marca por DÍA (la celda no
  // sabe de horas), el eje horario los marca en el bloque concreto.
  const conflictCardIds = useMemo(() => existingConflicts(cards), [cards]);

  /**
   * A qué instante iría la card si se soltara acá. En mes se conserva la hora
   * de pared (la celda es un día entero y no dice nada de horarios); en
   * semana y día la posición vertical ES la hora, así que sale del offset
   * imantado al cuarto. Es la misma diferencia que hace que arrastrar en
   * semana cambie la hora y en mes no.
   */
  const targetFor = useCallback(
    (card: PublicationCardDto, key: string, offsetY: number) => {
      const day = parseDate(key);
      if (view === "mes") return movedToDay(card, day, timeZone);
      return instantAt(day, minutesFromOffset(offsetY), timeZone);
    },
    [timeZone, view],
  );

  const verdictOf = useCallback(
    (card: PublicationCardDto, key: string, offsetY = 0) =>
      verdictFor(card, parseDate(key), cards, timeZone, undefined, targetFor(card, key, offsetY)),
    [cards, targetFor, timeZone],
  );

  /**
   * Mueve una o varias cards al mismo instante, optimista. La grilla se
   * actualiza antes de que responda el servidor: soltar tiene que sentirse
   * instantáneo o el gesto pierde todo lo que lo hacía valer. Si falla, se
   * revierte y se dice por qué.
   *
   * Recibe una lista porque un grupo multi-red se mueve entero: las N redes
   * comparten instante y tienen que seguir compartiéndolo en el destino, o el
   * grupo se rompe (la agrupación es derivada de `groupId` + `scheduledAt`).
   * Un solo aviso para todas: tres toasts por un gesto son ruido.
   */
  /**
   * El veredicto del conjunto es el PEOR de sus redes. `past` gana sobre
   * `conflict` porque bloquea; `conflict` sobre `valid` porque avisa. Con
   * una sola card es idéntico a `verdictOf`.
   */
  const worstVerdict = useCallback(
    (group: PublicationCardDto[], key: string, offsetY: number) => {
      const verdicts = group.map((card) => verdictOf(card, key, offsetY));
      if (verdicts.includes("past")) return "past" as const;
      if (verdicts.includes("conflict")) return "conflict" as const;
      return "valid" as const;
    },
    [verdictOf],
  );

  const moveCards = useCallback(
    async (moving: PublicationCardDto[], at: string, landingDay: string) => {
      const conCuenta = moving.filter((card) => card.socialAccountId !== null);
      if (conCuenta.length === 0) {
        toast({ title: "Esta publicación no tiene una cuenta conectada." });
        return;
      }
      // Un grupo con alguna red sin cuenta se movería a medias, y como la
      // agrupación se deriva del instante compartido, se partiría en dos sin
      // que nada lo explique. Se avisa antes de mover.
      if (conCuenta.length !== moving.length) {
        toast({
          title: "Una red del grupo no tiene cuenta conectada.",
          description: "Se movieron las demás; esa se queda donde estaba.",
        });
      }
      const previous = conCuenta.map((card) => ({
        id: card.id,
        socialAccountId: card.socialAccountId!,
        scheduledAt: card.scheduledAt,
        card,
      }));
      for (const card of conCuenta) upsert({ ...card, scheduledAt: at });
      setFlashDay(landingDay);

      try {
        const movidas = await Promise.all(
          previous.map((p) =>
            rescheduleCard(p.id, { socialAccountId: p.socialAccountId, scheduledAt: at }),
          ),
        );
        for (const card of movidas) upsert(card);
      } catch (error) {
        // Revertir a la copia local NO alcanza. Reprogramar es, del lado del
        // servidor, cancelar el post viejo en el proveedor y crear uno nuevo
        // (ADR-009): si lo segundo falla, la card NO vuelve sola a donde
        // estaba — CardsService la deja en `draft` (rechazo explícito) o en
        // `failed` (fallo ambiguo). Escribir de vuelta el scheduledAt viejo
        // dejaría la grilla mostrando una programación que ya no existe.
        // Se revierte igual para que el hueco no dure el viaje de ida y
        // vuelta, y enseguida se recarga para quedarse con la verdad. Con un
        // grupo puede haber movidas y no movidas: la recarga las reconcilia.
        for (const p of previous) upsert({ ...p.card, scheduledAt: p.scheduledAt });
        setFlashDay(null);
        toast({
          title: error instanceof ApiError ? error.message : "No se pudo mover la publicación.",
          // Con varias redes, `Promise.all` corta en el primer fallo pero las
          // otras llamadas siguen vivas y pueden haber funcionado: afirmar
          // que no se movió nada sería mentir. La recarga de abajo deja la
          // verdad en pantalla.
          description:
            conCuenta.length > 1
              ? "Puede que algunas redes sí se hayan movido. Revisa su estado."
              : "La publicación no se movió. Revisa su estado.",
        });
        await reload();
        return;
      }

      const restaurables = previous.filter((p) => p.scheduledAt !== null);
      toast({
        title: `Reprogramado para el ${formatDayLong(parseDate(landingDay)).toLowerCase()}`,
        description:
          conCuenta.length > 1
            ? `${String(conCuenta.length)} redes a las ${formatTime(zonedFromIso(at, timeZone))}`
            : `A las ${formatTime(zonedFromIso(at, timeZone))}`,
        onUndo:
          restaurables.length > 0
            ? () => {
                Promise.all(
                  restaurables.map((p) =>
                    rescheduleCard(p.id, {
                      socialAccountId: p.socialAccountId,
                      scheduledAt: p.scheduledAt!,
                    }),
                  ),
                )
                  .then((restored) => {
                    for (const card of restored) upsert(card);
                  })
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
    },
    [reload, timeZone, toast, upsert],
  );

  // "Por qué no existe en mobile: el drag-and-drop táctil es notoriamente
  // malo. Confunde con scroll, los targets son chicos, la precisión es baja"
  // (presencia-calendario.md §3). Además de la razón de producto hay una
  // mecánica: los elementos arrastrables necesitan `touch-action: none`, y
  // eso deja la lista de borradores SIN scroll en una pantalla táctil —
  // cualquier deslizamiento vertical se interpretaría como arrastre. La
  // alternativa en táctil es el menú ⋮ → Reprogramar, que ya existe.
  const canDrag = useMediaQuery("(pointer: fine)");
  // Abajo de 768px: celdas con puntos en vez de píldoras, panel del día como
  // hoja inferior modal y bandeja de borradores oculta (sin arrastre no tiene
  // para qué ocupar ancho — los borradores siguen alcanzables desde Chat).
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Abajo de 1024 la bandeja va colapsada SIEMPRE, sin mirar la preferencia:
  // con 300px fijos las celdas del mes caen a ~66px de ancho y las píldoras
  // dejan de leerse. La preferencia no se borra —se ignora mientras no haya
  // ancho— así que al volver a escritorio se aplica otra vez. Un efecto que
  // la pusiera en `null` la habría perdido de verdad: acá no persiste en
  // ningún lado, a diferencia del sidebar del shell.
  const draftsCollapsed = isDesktop ? (userDraftsCollapsed ?? false) : true;

  const folders = useFoldersStore((state) => state.folders);
  const refreshFolders = useFoldersStore((state) => state.refresh);
  useEffect(() => {
    if (folders === null) void refreshFolders();
  }, [folders, refreshFolders]);

  // Solo la PRIMERA carga muestra esqueleto. Al cambiar de mes la grilla
  // conserva lo anterior (calendar-store no lo limpia), que se lee mejor que
  // parpadear a vacío y volver.
  //
  // Hace falta el ref: el store arranca en `loading: false`, así que un
  // efecto que solo mire `!loading` marca "ya cargó" en el primer render,
  // antes de que exista una respuesta — el esqueleto quedaba muerto y la
  // primera carga mostraba la grilla vacía. Solo cuenta un ciclo completo:
  // se vio `loading: true` y después volvió a `false`.
  const [everLoaded, setEverLoaded] = useState(false);
  const loadStartedRef = useRef(false);
  useEffect(() => {
    if (loading) loadStartedRef.current = true;
    else if (loadStartedRef.current) setEverLoaded(true);
  }, [loading]);

  // navigator.onLine miente hacia el lado optimista (un wifi sin salida sigue
  // diciendo true), así que sirve para avisar cuando SÍ está caído, no para
  // garantizar lo contrario. Con eso alcanza: el aviso es informativo.
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const { drag, startDrag, ghostRef, justDragged } = useDragSchedule({
    // "past" sí lo decide el líder —todas comparten instante por definición
    // del grupo— pero el CONFLICTO no: `findConflict` es por red, así que un
    // grupo de Instagram+LinkedIn que cae sobre un LinkedIn ya programado a
    // esa hora solo choca en una de sus redes. Ver `worstVerdict`.
    isBlocked: (dragged, key, offsetY) => worstVerdict(dragged, key, offsetY) === "past",
    // Soltar sobre la bandeja devuelve a borrador: el camino inverso al de
    // programar, con la misma confirmación y el mismo Deshacer que el menú.
    onDropDrafts: (dragged) => {
      const programadas = dragged.filter((c) => c.scheduledAt !== null);
      if (programadas.length === 0) return;
      void cancelMany(programadas, { reload, toast });
    },
    onDrop: (dragged, key, offsetY) => {
      const card = dragged[0]!;
      const day = parseDate(key);
      // Un borrador no trae hora: el Calendario decide el DÍA y el drawer la
      // hora, cada módulo con su responsabilidad (§3). Por eso no se programa
      // al soltar, se abre el formulario con la fecha puesta.
      //
      // En mes son las 10:00 por default. En semana y día el usuario SÍ
      // apuntó a una hora con el gesto, y descartarla para volver a las 10:00
      // sería tirar información que acaba de dar.
      //
      // Las 10:00 en la zona del USUARIO: `day.toDate(tz)` + setHours(10)
      // parecía equivalente y no lo es — setHours trabaja en la zona del
      // navegador, y con las dos zonas distintas el drawer abría en otro día.
      if (!card.scheduledAt) {
        const minutes = view === "mes" ? 10 * 60 : minutesFromOffset(offsetY);
        const preset = instantAt(day, minutes, timeZone).toDate();
        openDrawer(dragged, { presetDate: preset, onDone: () => void reload() });
        return;
      }
      const target = targetFor(card, key, offsetY);
      if (!target) return;
      if (worstVerdict(dragged, key, offsetY) === "conflict") {
        const choca = dragged.find((c) => verdictOf(c, key, offsetY) === "conflict") ?? card;
        setConflict({ cards: dragged, network: choca.network, at: target });
        return;
      }
      const at = target.toDate().toISOString();
      // Soltar donde ya estaba no es un cambio. Sin este corte se dispararía
      // una reprogramación completa —que del lado del servidor es cancelar en
      // el proveedor y volver a crear (ADR-009)— más un toast de
      // "Reprogramado", por un empujón que no movió nada.
      if (at === card.scheduledAt) return;
      void moveCards(dragged, at, key);
    },
  });

  const draggingIds = useMemo(() => new Set((drag?.cards ?? []).map((card) => card.id)), [drag]);

  // La bandeja solo se ofrece como destino cuando lo que viaja YA está
  // programado: arrastrar un borrador hacia ella no significa nada.
  const draftsDropTarget: "idle" | "over" | undefined = !drag
    ? undefined
    : drag.cards.some((card) => card.scheduledAt !== null)
      ? drag.overDrafts
        ? "over"
        : "idle"
      : undefined;

  const dragInfo = useMemo(() => {
    if (!drag) return null;
    const verdictByDay = new Map(
      visibleDays.map(
        (day) => [dayKey(day), worstVerdict(drag.cards, dayKey(day), drag.overOffsetY)] as const,
      ),
    );
    return { overDay: drag.overDay, overOffsetY: drag.overOffsetY, verdictByDay };
  }, [drag, verdictOf, visibleDays]);

  // El destello se apaga solo. Va acá y no en CSS con animationend porque el
  // día que destella es estado de React: la clase tiene que salir del DOM.
  useEffect(() => {
    if (!flashDay) return;
    const timer = window.setTimeout(() => setFlashDay(null), 1000);
    return () => window.clearTimeout(timer);
  }, [flashDay]);

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

  /**
   * Qué aviso va sobre la grilla cuando no hay nada que mostrar. El orden
   * importa: primero se descarta que sea culpa de los filtros (tiene arreglo
   * de un click), después que la cuenta esté vacía de verdad, y recién al
   * final el caso aburrido de un periodo sin nada.
   */
  const emptyState = useMemo(() => {
    if (loading || cards.length > 0) return null;
    if (activeCount > 0) return <EmptyByFiltersState onClear={() => setFilters({})} />;
    // "Primera vez" es una afirmación sobre la CUENTA, no sobre el periodo
    // que se está mirando: `cards` es solo el rango visible, así que un
    // usuario con meses de historial que avanza tres meses vería el
    // onboarding. La señal de cuenta son los chats — toda publicación nace
    // en Chat, así que cero chats es cero publicaciones posibles. Mientras
    // no hayan cargado (`null`) se muestra el estado de periodo, que nunca
    // miente.
    const cuentaVacia = chats !== null && chats.length === 0 && drafts.length === 0;
    if (cuentaVacia) return <FirstTimeState />;
    const period = view === "mes" ? "este mes" : view === "semana" ? "esta semana" : "este día";
    return <EmptyPeriodState period={period} />;
  }, [activeCount, cards.length, chats, drafts.length, loading, setFilters, view]);

  const startDragCard = useCallback(
    (event: React.PointerEvent, cardIds: string[]) => {
      const dragged = cardIds
        .map((id) => cards.find((item) => item.id === id))
        .filter((card): card is PublicationCardDto => card !== undefined);
      if (dragged.length > 0) startDrag(event, dragged);
    },
    [cards, startDrag],
  );

  const openCard = useCallback(
    (cardId: string) => {
      // El navegador dispara un click de compatibilidad al terminar cualquier
      // gesto de puntero: sin esta guarda, soltar una publicación abría
      // además su modal, como si le hubieran hecho click.
      if (justDragged()) return;
      const card = cards.find((item) => item.id === cardId);
      if (card) actions.onView(card);
    },
    [actions, cards, justDragged],
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
        periodLabel={periodLabel}
        onChangeView={setView}
        // En mes se ancla al MES y no al día enfocado: `focusedDay.add({months:1})`
        // recorta el día al último del mes destino y el recorte no es
        // reversible — desde el 31 de agosto, ◀ ◀ ▶ devuelve el 30 de julio.
        // En semana y día el salto es exacto y no hay nada que recortar.
        onPrev={() => setFocusedDay(stepPeriod(view, focusedDay, month, -1))}
        onNext={() => setFocusedDay(stepPeriod(view, focusedDay, month, 1))}
        onToday={() => setFocusedDay(today)}
        filters={filters}
        activeFilterCount={activeCount}
        folders={folders ?? []}
        onChangeFilters={setFilters}
        onOpenDrafts={isMobile ? () => setDraftsSheetOpen(true) : undefined}
        draftCount={visibleDrafts.length}
      />

      {offline && <OfflineBanner />}
      {disconnectedNetworks.length > 0 && (
        <DisconnectedChannelsBanner networks={disconnectedNetworks} />
      )}

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
          filtered={activeCount > 0}
        />
      )}

      {!everLoaded && loading ? (
        <CalendarSkeleton withDrafts={!isMobile} draftsCollapsed={draftsCollapsed} />
      ) : view === "mes" ? (
        <div className="relative flex min-h-0 flex-1">
          {/* En mobile la bandeja no vive acá: no hay ancho para una columna
              fija ni gesto de arrastre. Se abre como hoja desde la toolbar,
              con un botón "Programar" por borrador. */}
          {!isMobile && (
            <DraftsPanel
              drafts={visibleDrafts}
              collapsed={draftsCollapsed}
              onToggle={() => setUserDraftsCollapsed(!draftsCollapsed)}
              onStartDrag={canDrag ? (event, card) => startDrag(event, [card]) : undefined}
              draggingId={draggingIds.size > 0 ? [...draggingIds][0]! : null}
              dropTarget={draftsDropTarget}
            />
          )}
          <MonthGrid
            month={month}
            today={today}
            focusedDay={focusedDay}
            entriesByDay={entriesByDay}
            timeZone={timeZone}
            drag={dragInfo}
            conflictDays={conflictDays}
            flashDay={flashDay}
            draggingCardIds={draggingIds}
            onStartDragCard={canDrag && !isMobile ? startDragCard : undefined}
            onOpenCard={openCard}
            compact={isMobile}
            onFocusDay={setFocusedDay}
            onSelectDay={(day) => {
              setFocusedDay(day);
              setSelectedKey(dayKey(day));
            }}
          />
          {emptyState}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          {!isMobile && (
            <DraftsPanel
              drafts={visibleDrafts}
              collapsed={draftsCollapsed}
              onToggle={() => setUserDraftsCollapsed(!draftsCollapsed)}
              onStartDrag={canDrag ? (event, card) => startDrag(event, [card]) : undefined}
              draggingId={draggingIds.size > 0 ? [...draggingIds][0]! : null}
              dropTarget={draftsDropTarget}
            />
          )}
          {view === "semana" ? (
            <WeekGrid
              anchor={focusedDay}
              today={today}
              entriesByDay={entriesByDay}
              timeZone={timeZone}
              drag={dragInfo}
              conflictCardIds={conflictCardIds}
              draggingCardIds={draggingIds}
              onStartDragCard={canDrag ? startDragCard : undefined}
              onOpenCard={openCard}
              onSelectDay={(day) => {
                setFocusedDay(day);
                setView("dia");
              }}
            />
          ) : (
            <DayTimeline
              day={focusedDay}
              today={today}
              entriesByDay={entriesByDay}
              timeZone={timeZone}
              drag={dragInfo}
              conflictCardIds={conflictCardIds}
              draggingCardIds={draggingIds}
              onStartDragCard={canDrag ? startDragCard : undefined}
              onOpenCard={openCard}
            />
          )}
          {emptyState}
        </div>
      )}

      <AnimatePresence>
        {isMobile && draftsSheetOpen && (
          <DraftsPanel
            key="drafts-sheet"
            drafts={visibleDrafts}
            collapsed={false}
            asSheet
            onToggle={() => setDraftsSheetOpen(false)}
            onSchedule={(card) => {
              setDraftsSheetOpen(false);
              openDrawer([card], { presetDate: null, onDone: () => void reload() });
            }}
            draggingId={null}
          />
        )}

        {selectedDay && (
          <DayPanel
            key={selectedKey}
            day={selectedDay}
            today={today}
            entries={entriesByDay.get(dayKey(selectedDay)) ?? []}
            timeZone={timeZone}
            actions={actions}
            highlightedCardId={highlightedCardId}
            asSheet={isMobile}
            onClose={() => setSelectedKey(null)}
            onCreate={() => void navigate(`/chats?fecha=${dayKey(selectedDay)}`)}
          />
        )}
      </AnimatePresence>

      {modalCards.length > 0 && (
        <CardModal cards={modalCards} actions={actions} onClose={() => setModalCardIds(null)} />
      )}

      {drag && (
        <DragGhost
          cards={drag.cards}
          ghostRef={ghostRef}
          timeZone={timeZone}
          blocked={drag.overDay !== null && dragInfo?.verdictByDay.get(drag.overDay) !== "valid"}
        />
      )}

      {conflict &&
        (() => {
          const target = conflict.at;
          const suggestion = suggestLater(target);
          // El día de aterrizaje sale de la SUGERENCIA, no del día donde se
          // soltó: +30 minutos sobre las 23:45 cae en el día siguiente, y
          // con el día viejo el toast nombraba una fecha equivocada y el
          // destello iluminaba la celda de al lado.
          const landing = dayKey(toCalendarDate(suggestion));
          return (
            <ConflictDialog
              cards={conflict.cards}
              network={conflict.network}
              target={target}
              suggestion={suggestion}
              onAccept={() => {
                const moving = conflict.cards;
                setConflict(null);
                void moveCards(moving, suggestion.toDate().toISOString(), landing);
              }}
              // "Programar de todas formas": la spec dice que un conflicto
              // informa y NUNCA bloquea (§4). Sin esta salida, dejar dos
              // publicaciones de la misma red a la misma hora —que a veces es
              // justo lo que se quiere— obligaba a rendirse y repetir la hora
              // a mano en el drawer.
              onForce={() => {
                const moving = conflict.cards;
                setConflict(null);
                void moveCards(
                  moving,
                  target.toDate().toISOString(),
                  dayKey(toCalendarDate(target)),
                );
              }}
              onPickAnother={() => {
                const moving = conflict.cards;
                setConflict(null);
                openDrawer(moving, {
                  presetDate: target.toDate(),
                  onDone: () => void reload(),
                });
              }}
              onCancel={() => setConflict(null)}
            />
          );
        })()}

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

/** El nombre del mes en minúscula, para componer el rango de la vista semana. */
function monthNameOf(date: CalendarDate): string {
  return formatMonthLabel(date).split(" ")[0]!.toLowerCase();
}

/**
 * Un paso de periodo hacia adelante o atrás. En mes se ancla al MES y no al
 * día enfocado: sumarle un mes al día 31 lo recorta al último del mes destino,
 * y ese recorte no es reversible — desde el 31 de agosto, ◀ ◀ ▶ devolvía el
 * 30 de julio. En semana y día el salto es exacto y no hay nada que recortar.
 */
function stepPeriod(
  view: CalendarView,
  focusedDay: CalendarDate,
  month: CalendarDate,
  direction: 1 | -1,
): CalendarDate {
  if (view === "mes") return month.add({ months: direction });
  if (view === "semana") return focusedDay.add({ weeks: direction });
  return focusedDay.add({ days: direction });
}
