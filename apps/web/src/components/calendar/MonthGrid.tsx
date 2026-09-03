import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { type CalendarDate, isSameMonth } from "@internationalized/date";
import { capEntries, type CalendarEntry, type EntriesByDay } from "../../lib/calendar/group.js";
import { monthWeeks } from "../../lib/calendar/grid.js";
import { dayKey, formatDayLong, formatWeekdayShort, weekStart } from "../../lib/calendar/tz.js";
import { CalendarEntryPill } from "./CalendarEntryPill.js";
import { Tooltip } from "../ui/Tooltip.js";
import type { DropVerdict } from "../../lib/calendar/schedule-move.js";

// Grilla del mes (F7 PR1).
//
// No scrollea: 5-6 filas `1fr` que llenan el alto disponible. Es una
// decisión de layout, no de estilo — el módulo ya tiene regiones con scroll
// propio (panel de borradores, panel del día) y agregarle una tercera a la
// grilla misma es lo que ADR-014 pide evitar.
//
// Accesibilidad: role="grid" con roving tabindex. Solo una celda es
// tabbable; las flechas mueven el foco entre días y, si el día nuevo cae
// fuera del mes visible, el padre navega de periodo y el foco lo sigue. Las
// filas usan `display: contents` para existir en el árbol de accesibilidad
// sin romper la grilla CSS de 7 columnas.

export interface MonthGridDrag {
  /** Día bajo el cursor ahora mismo, o null. */
  overDay: string | null;
  /** Veredicto por día. Se calcula una vez al empezar el gesto, no por frame. */
  verdictByDay: Map<string, DropVerdict>;
}

interface MonthGridProps {
  month: CalendarDate;
  today: CalendarDate;
  focusedDay: CalendarDate;
  entriesByDay: EntriesByDay;
  timeZone: string;
  /** Activo solo mientras se arrastra algo. */
  drag: MonthGridDrag | null;
  /** Días con dos publicaciones de la misma red a la misma hora. */
  conflictDays: Set<string>;
  /** Día que acaba de recibir una publicación: destella y se apaga. */
  flashDay: string | null;
  draggingCardIds: ReadonlySet<string>;
  /** Ausente en pantallas táctiles: ahí no hay arrastre (ver calendario.tsx). */
  onStartDragCard?: (event: React.PointerEvent, cardIds: string[]) => void;
  /**
   * Abajo de 768px las píldoras con texto no entran: la celda pasa a puntos
   * de color, uno por publicación. Es lo que hace el mockup de mobile, y la
   * alternativa —píldoras truncadas a dos caracteres— no comunica nada que
   * el punto no comunique.
   */
  compact?: boolean;
  /** Click en un post: abre su vista, no la del día. */
  onOpenCard: (cardId: string) => void;
  onFocusDay: (day: CalendarDate) => void;
  onSelectDay: (day: CalendarDate) => void;
}

// Clases del destino durante el arrastre. El día bajo el cursor se marca más
// fuerte que los demás válidos: hay que poder ver DÓNDE va a caer, no solo
// que se puede soltar en algún lado.
const DROP_CLASS: Record<DropVerdict, { idle: string; over: string }> = {
  valid: {
    idle: "border-dashed border-ai bg-cal-drop-valid",
    over: "bg-cal-drop-target inset-ring-2 inset-ring-ai",
  },
  conflict: {
    idle: "border-dashed border-warning bg-cal-drop-conflict",
    over: "bg-cal-drop-conflict inset-ring-2 inset-ring-warning",
  },
  // El pasado no cambia de fondo: lo cubre el velo, que es una capa aparte.
  past: { idle: "cursor-not-allowed", over: "cursor-not-allowed" },
};

/**
 * ¿Este veredicto pinta la celda? Si sí, su fondo, su borde y su anillo
 * SUSTITUYEN a los de la celda en vez de apilarse.
 *
 * Vale para las tres propiedades por el mismo motivo, que ya mordió dos
 * veces: entre dos utilities que tocan lo mismo gana la que Tailwind emite
 * última, no la que esté después en el atributo `class`. En el CSS generado
 * `.border-transparent` sale después de `.border-ai` (así que el borde
 * punteado del destino válido era invisible) pero antes de `.border-warning`
 * (así que el del conflicto sí se veía) — dos estados hermanos con
 * comportamiento distinto sin que nadie lo decidiera. Igual con
 * `.inset-ring-primary`, que sale después de `.inset-ring-ai`: en la celda
 * de HOY, la única donde no se podía ver dónde iba a caer la card.
 */
const OVERRIDES_CELL: Record<DropVerdict, boolean> = { valid: true, conflict: true, past: false };

export function MonthGrid({
  month,
  today,
  focusedDay,
  entriesByDay,
  timeZone,
  drag,
  conflictDays,
  flashDay,
  draggingCardIds,
  onStartDragCard,
  onOpenCard,
  compact = false,
  onFocusDay,
  onSelectDay,
}: MonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = monthWeeks(month);
  const focusedKey = dayKey(focusedDay);
  const maxRows = useRowsThatFit(gridRef, weeks.length, compact);

  // Mover el foco del DOM detrás del estado, pero SOLO si el movimiento salió
  // del teclado dentro de la grilla: si no, entrar a la página le robaría el
  // foco al usuario desde donde esté (la topbar, el sidebar).
  //
  // La intención se marca en un ref durante el keydown y NO se relee
  // `document.activeElement` en el efecto: cuando el día nuevo cae en otro
  // mes, la celda que tenía el foco se desmonta antes de que corran los
  // efectos, así que para entonces activeElement ya es <body> y el chequeo
  // daba falso justo en el caso que hay que cubrir — PageDown desde el 15 de
  // agosto dejaba el foco en la nada y las flechas siguientes no hacían nada.
  const keyboardMove = useRef(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !keyboardMove.current) return;
    keyboardMove.current = false;
    grid.querySelector<HTMLElement>(`[data-day="${focusedKey}"]`)?.focus();
  }, [focusedKey]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => CalendarDate> = {
      ArrowLeft: () => focusedDay.subtract({ days: 1 }),
      ArrowRight: () => focusedDay.add({ days: 1 }),
      ArrowUp: () => focusedDay.subtract({ weeks: 1 }),
      ArrowDown: () => focusedDay.add({ weeks: 1 }),
      Home: () => weekStart(focusedDay),
      End: () => weekStart(focusedDay).add({ days: 6 }),
      PageUp: () => focusedDay.subtract({ months: 1 }),
      PageDown: () => focusedDay.add({ months: 1 }),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      keyboardMove.current = true;
      onFocusDay(move());
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDay(focusedDay);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-line bg-card">
        {weeks[0]?.map((day, index) => (
          <div
            key={day.toString()}
            // Columnas 0 y 6 con la semana arrancando en domingo (WEEK_START):
            // el fin de semana ya no son las dos últimas, son los extremos.
            className={`px-3 py-2 font-display text-[11px] font-semibold tracking-wide uppercase ${
              index === 0 || index === 6 ? "text-plum-200" : "text-fg-muted"
            }`}
          >
            {formatWeekdayShort(day)}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Calendario del mes"
        onKeyDown={handleKeyDown}
        className="grid min-h-0 flex-1 grid-cols-7 border-t border-line"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week) => (
          <div key={week[0]!.toString()} role="row" className="contents">
            {week.map((day) => {
              const key = dayKey(day);
              const outside = !isSameMonth(day, month);
              const isToday = day.compare(today) === 0;
              const { visible, hidden } = capEntries(entriesByDay.get(key) ?? [], maxRows);
              const verdict = drag ? drag.verdictByDay.get(key) : undefined;
              const dropClass =
                drag && verdict ? DROP_CLASS[verdict][drag.overDay === key ? "over" : "idle"] : "";
              // El fondo del destino SUSTITUYE al de la celda en vez de
              // apilarse: dos utilities de background-color compiten en la
              // cascada y gana la que Tailwind emita última, no la del final
              // del atributo class. Apilándolas, el tinte no se veía.
              const painted = verdict ? OVERRIDES_CELL[verdict] : false;
              const bgClass = painted ? "" : outside ? "bg-cal-day-out" : "bg-card";
              // El borde base solo se pone si el veredicto no trae el suyo.
              const borderClass = painted ? "" : "border-transparent";
              const todayRing = isToday && !painted ? "inset-ring-2 inset-ring-primary" : "";
              return (
                <div
                  key={key}
                  role="gridcell"
                  data-day={key}
                  data-drop-day={key}
                  tabIndex={key === focusedKey ? 0 : -1}
                  aria-selected={key === focusedKey}
                  aria-label={formatDayLong(day)}
                  onClick={() => {
                    onFocusDay(day);
                    onSelectDay(day);
                  }}
                  className={`relative flex min-w-0 cursor-pointer flex-col overflow-hidden border border-r-line border-b-line outline-none select-none nth-[7n]:border-r-0 ${
                    // 44px es el mínimo táctil; con gap chico y centrado el
                    // número y los puntos entran sin apretarse.
                    compact ? "min-h-11 items-center gap-1 p-1" : "gap-[3px] p-1.5"
                  } ${borderClass} ${bgClass} ${todayRing} ${
                    key === flashDay ? "cal-flash" : ""
                  } ${dropClass} focus-visible:inset-ring-2 focus-visible:inset-ring-line-focus`}
                >
                  {/* El velo del pasado va como capa y no como opacidad sobre
                      la celda: bajarle la opacidad al contenedor apagaría
                      también el resaltado de destino de las celdas vecinas. */}
                  {verdict === "past" && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[1] bg-cal-drop-past"
                    />
                  )}
                  {conflictDays.has(key) && !drag && (
                    <Tooltip label="Dos publicaciones de la misma red a la misma hora">
                      {/* role="img": ARIA no permite nombrar un `role=generic`,
                          así que sin esto el lector de pantalla se comía el
                          aviso en vez de leerlo. */}
                      <span
                        role="img"
                        aria-label="Dos publicaciones de la misma red a la misma hora"
                        className="absolute top-1.5 right-1.5 z-[2] flex size-4 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-card"
                      >
                        <AlertTriangle size={10} strokeWidth={2.5} />
                      </span>
                    </Tooltip>
                  )}
                  <span
                    className={`flex h-[22px] items-center px-0.5 font-display font-semibold ${
                      compact ? "text-[12px]" : "text-[12.5px]"
                    } ${outside ? "text-fg-muted" : "text-fg"}`}
                  >
                    {isToday ? (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-primary-fg">
                        {day.day}
                      </span>
                    ) : (
                      day.day
                    )}
                  </span>

                  {/* La lista se recorta y el chip "+N más" no: en una
                      ventana baja la celda no da para tres píldoras, y lo
                      último que puede desaparecer es justamente el aviso de
                      que hay más. Por eso el chip va fuera del contenedor
                      que recorta, con shrink-0. */}
                  {compact ? (
                    <DayDots entries={entriesByDay.get(key) ?? []} />
                  ) : (
                    <>
                      <div className="flex min-h-0 flex-col gap-[3px] overflow-hidden">
                        {visible.map((entry) => (
                          <CalendarEntryPill
                            key={entry.key}
                            entry={entry}
                            timeZone={timeZone}
                            draggingCardIds={draggingCardIds}
                            onStartDragCard={onStartDragCard}
                            onOpenCard={onOpenCard}
                          />
                        ))}
                      </div>
                      {hidden > 0 && (
                        <span className="shrink-0 self-start rounded px-1.5 font-display text-[10.5px] font-semibold text-accent">
                          +{hidden} más
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La celda en mobile: un punto por publicación, con el color de su estado.
 * Hasta cuatro; a partir de ahí, un "+N" chiquito. Sin texto — a este ancho
 * un título truncado a dos caracteres no dice nada que el punto no diga, y
 * el mockup de mobile ya lo resolvía así.
 */
function DayDots({ entries }: { entries: CalendarEntry[] }) {
  const cards = entries.flatMap((entry) => entry.cards);
  const visible = cards.slice(0, 4);
  const hidden = cards.length - visible.length;
  if (cards.length === 0) return null;

  return (
    <span className="flex max-w-[38px] flex-wrap justify-center gap-[3px]">
      {visible.map((card) => (
        <span
          key={card.id}
          className={`size-1.5 rounded-full ${DOT_TONE[card.status] ?? "bg-ai"}`}
        />
      ))}
      {hidden > 0 && (
        <span className="font-display text-[8px] leading-[6px] font-bold text-accent">
          +{hidden}
        </span>
      )}
    </span>
  );
}

const DOT_TONE: Record<string, string> = {
  scheduled: "bg-info",
  published: "bg-success",
  draft: "bg-ai",
  failed: "bg-error",
  canceled: "bg-fg-muted",
};

// Cuántas píldoras entran de verdad en una celda. Antes era 3 fijo, y en una
// pantalla más baja que ancha (1680×1050, donde lo cazó el QA) las que no
// cabían se recortaban contra el `overflow-hidden` SIN sumarse al "+N más":
// el contador decía la verdad sobre el cap, no sobre lo que se ve.
//
// Se mide la altura real de una fila de la grilla y se descuenta lo que
// siempre ocupa espacio: el número del día, el chip "+N más" y los paddings.
// Un ResizeObserver sobre la grilla entera alcanza — las filas son `1fr`, así
// que todas miden lo mismo y cambian a la vez.
const DAY_NUMBER_HEIGHT = 22;
const MORE_CHIP_HEIGHT = 16;
const CELL_PADDING = 12; // p-1.5 arriba y abajo
const PILL_HEIGHT = 24; // borde + py-0.5 + línea de 11px
const PILL_GAP = 3;

function useRowsThatFit(
  ref: React.RefObject<HTMLDivElement | null>,
  weekCount: number,
  compact: boolean,
): number {
  const [rows, setRows] = useState(3);

  useEffect(() => {
    // En compacto manda DayDots, que tiene su propio tope; no hay nada que medir.
    if (compact) return;
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const cellHeight = node.getBoundingClientRect().height / weekCount;
      const usable = cellHeight - DAY_NUMBER_HEIGHT - MORE_CHIP_HEIGHT - CELL_PADDING;
      const fit = Math.floor((usable + PILL_GAP) / (PILL_HEIGHT + PILL_GAP));
      // Nunca menos de una: una celda que no muestre NADA y solo diga "+3 más"
      // es peor que una apretada.
      setRows(Math.max(1, fit));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [ref, weekCount, compact]);

  return rows;
}
