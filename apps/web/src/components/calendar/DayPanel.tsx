import { useEffect, useRef } from "react";
import { CalendarPlus, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import type { CalendarDate } from "@internationalized/date";
import { useInspector } from "../../lib/floating/use-inspector.js";
import { sheetRight } from "../../lib/motion.js";
import { BottomSheet } from "./BottomSheet.js";
import type { CalendarEntry } from "../../lib/calendar/group.js";
import { formatDayLong, formatRelativeDay } from "../../lib/calendar/tz.js";
import { DayPanelCard, type DayCardActions } from "./DayPanelCard.js";
import { Tooltip } from "../ui/Tooltip.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { etiquetaDeFranja } from "@presencia/shared";
import { useVentanasDelDia } from "../../lib/use-ritmo.js";

// Panel de detalle del día. Overlay NO modal y sin backdrop: flota sobre el
// borde derecho de la grilla con sombra, se cierra con Escape o con un click
// afuera, y no atrapa el foco.
//
// El doc de producto pedía backdrop, pero su propia justificación es
// "mantiene la grilla parcialmente visible al fondo" — y un backdrop la
// oscurece, que es exactamente lo contrario. La otra opción, empujar in-flow
// como el ScheduleDrawer, reflowearía las 7 columnas del mes en cada
// apertura. Ver el addendum de ADR-015.
//
// Clickear otra celda NO cierra: cambia de día. Sin esa excepción el
// mousedown cerraría y el click reabriría, con las dos animaciones enteras
// en el medio.

interface DayPanelProps {
  day: CalendarDate;
  today: CalendarDate;
  entries: CalendarEntry[];
  timeZone: string;
  actions: DayCardActions;
  /** Card a la que llegó un deep-link "Ver en calendario" desde Chat. */
  highlightedCardId?: string | null;
  /**
   * Abajo de 768px el panel deja de ser un inspector lateral y pasa a ser
   * una hoja inferior MODAL, con backdrop y trampa de foco. No es una
   * variante estética: en desktop el panel no bloquea porque la grilla al
   * lado sigue siendo útil; en un teléfono el panel ocupa la pantalla, así
   * que fingir que el fondo está vivo sería mentir. Mismo trato que el
   * bottom-sheet del ScheduleDrawer (ADR-014).
   */
  asSheet?: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function DayPanel({
  day,
  today,
  entries,
  timeZone,
  actions,
  highlightedCardId,
  asSheet = false,
  onClose,
  onCreate,
}: DayPanelProps) {
  const { refs, getFloatingProps } = useInspector({
    // Apagado en la variante hoja: ahí el dismiss lo pone BottomSheet, y un
    // useDismiss sin floating element montado toma cualquier mousedown como
    // click de afuera.
    enabled: !asSheet,
    onClose,
    ignoreOutsidePress: (target) =>
      target.closest('[role="grid"], [data-schedule-drawer], [data-toast-viewport]') !== null,
  });

  // Traer la card del deep-link a la vista: el día puede tener más
  // publicaciones de las que entran en el panel.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightedCardId) return;
    listRef.current
      ?.querySelector(`[data-card-id="${highlightedCardId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedCardId]);

  const isPast = day.compare(today) < 0;
  // Las ventanas solo se piden cuando el día está vacío y es futuro: en un día
  // con contenido no aportan nada, y en el pasado sugerir cuándo publicar es
  // un consejo que ya no sirve. `null` apaga la petición.
  const vacioFuturo = entries.length === 0 && !isPast;
  // `getUTCDay` y no `getDay`: `toDate("UTC")` construye la medianoche UTC del
  // día, y leerla con `getDay()` la interpreta en la zona del NAVEGADOR. Al
  // oeste de Greenwich —Mérida, el beachhead— esa medianoche cae en la tarde
  // del día anterior, así que el lunes se pedía como domingo. Los chips salían
  // igual de plausibles: es el tipo de error que no se ve, solo se mide.
  const ventanas = useVentanasDelDia(vacioFuturo ? (day.toDate("UTC").getUTCDay() + 6) % 7 : null);
  const total = entries.reduce((count, entry) => count + entry.cards.length, 0);
  const published = entries
    .flatMap((entry) => entry.cards)
    .filter((card) => card.status === "published").length;

  const body = (
    <>
      <div className="shrink-0 border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[11px] font-semibold tracking-wide text-accent uppercase">
              {formatRelativeDay(day, today)}
            </p>
            <h2 className="mt-0.5 font-display text-lg font-bold text-fg">{formatDayLong(day)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el panel del día"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary hover:text-brand"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Siempre visible, tenga el día 0 o 10 publicaciones — no hay regla
            escondida sobre cuándo aparece. En el pasado se deshabilita con el
            motivo a la vista en vez de desaparecer. */}
        <Tooltip label={isPast ? "No puedes crear publicaciones en el pasado" : undefined}>
          <button
            type="button"
            onClick={onCreate}
            disabled={isPast}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-[13px] font-semibold ${
              isPast
                ? "cursor-not-allowed bg-secondary text-fg-muted"
                : "bg-primary text-primary-fg shadow-sm transition-colors hover:bg-primary-hover"
            }`}
          >
            <Plus size={16} strokeWidth={2.5} />
            Crear para este día
          </button>
        </Tooltip>
      </div>

      {total > 0 ? (
        <>
          <div className="flex shrink-0 items-center justify-between px-5 py-2 text-[11px] text-fg-muted">
            <span>
              {total} {total === 1 ? "publicación" : "publicaciones"}
            </span>
            <span>{isPast && published === total ? "Completado" : "Por hora"}</span>
          </div>
          <div
            ref={listRef}
            className="flex min-h-0 flex-1 touch-pan-y flex-col gap-2 overflow-y-auto overscroll-contain px-4 pt-1 pb-5"
          >
            {entries.map((entry) => (
              <DayPanelCard
                key={entry.key}
                entry={entry}
                actions={actions}
                isPast={isPast}
                timeZone={timeZone}
                highlightedCardId={highlightedCardId}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 touch-pan-y flex-col items-start overflow-y-auto overscroll-contain px-5 pt-5">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary">
            <CalendarPlus size={26} strokeWidth={1.5} className="text-ai" />
          </div>
          <h3 className="mt-4 font-display text-base font-semibold text-fg">
            Sin publicaciones este día
          </h3>
          <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-fg-secondary">
            {isPast
              ? "No publicaste nada este día."
              : "Cuando crees contenido en Chat y lo programes para esta fecha, aparecerá aquí."}
          </p>
          {/* Los chips que pedía la spec, ahora que Ritmo tiene de dónde
              sacarlos. Si no hay historial suficiente no aparece nada: la
              alternativa sería prometer "tus mejores horarios" sin nada
              detrás. */}
          {ventanas.length > 0 && (
            <>
              <p className="mt-5 text-[13px] font-semibold text-fg">
                Tus mejores horarios para este día
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ventanas.map((ventana) => {
                  const meta = NETWORK_META[ventana.network];
                  return (
                    <span
                      key={`${ventana.network}-${String(ventana.franja)}`}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs"
                      title={
                        ventana.heredado
                          ? `Promedio de la franja ${etiquetaDeFranja(ventana.franja)} en ${meta.label}, no solo de este día`
                          : `Tus publicaciones de esta franja en ${meta.label} rinden ${String(ventana.lift)}% más`
                      }
                    >
                      <meta.Logo size={13} />
                      <span className="font-semibold text-fg">
                        {etiquetaDeFranja(ventana.franja)}
                      </span>
                      <span className="font-semibold text-accent">+{ventana.lift}%</span>
                    </span>
                  );
                })}
              </div>
              <Link
                to="/ritmo"
                className="mt-3 text-xs text-fg-muted underline-offset-2 hover:underline"
              >
                Ver tu estrategia en Ritmo
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );

  if (asSheet) {
    return (
      <BottomSheet label={`Publicaciones del ${formatDayLong(day)}`} onClose={onClose}>
        {body}
      </BottomSheet>
    );
  }

  return (
    <motion.aside
      ref={refs.setFloating}
      {...getFloatingProps()}
      variants={sheetRight}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="region"
      aria-label={`Publicaciones del ${formatDayLong(day)}`}
      className="absolute inset-y-0 right-0 z-20 flex w-[420px] max-w-full flex-col border-l border-line bg-card shadow-xl"
    >
      {body}
    </motion.aside>
  );
}
