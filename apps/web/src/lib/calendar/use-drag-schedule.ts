import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicationCardDto } from "@presencia/shared";

// Arrastrar para reprogramar (F7 PR3). La interacción estrella del módulo:
// sin ella reprogramar son cinco clicks, con ella es un gesto.
//
// ADR-014 addendum, al pie de la letra: un gesto pointer-driven NO puede
// tener duración ni curva, así que esto no usa motion. La posición del
// fantasma se escribe directo al DOM en cada pointermove
// (`ghost.style.transform`), sin pasar por React — cero renders por frame.
// Lo único que sí es estado de React es el día bajo el cursor, que cambia
// unas pocas veces por segundo y tiene que repintar los resaltados.
//
// El precedente en el repo es SidebarResizeHandle: misma forma (listeners
// sobre el elemento capturado, no sobre window) y mismo motivo.

/** Píxeles a recorrer antes de considerar que esto es un arrastre y no un click. */
const DRAG_THRESHOLD = 6;

/**
 * Los destinos con eje horario declaran en `data-drop-time` cuántos píxeles
 * mide un paso de su imantado. El render se hace cuando cambia el PASO, no
 * cada N píxeles sueltos: con un umbral en píxeles crudos el preview y el
 * resultado podían discrepar —la franja anunciando 01:45 mientras la card
 * caía a las 02:00— porque el drop usa el offset exacto y el preview usaba
 * uno redondeado por otro criterio. Midiendo en pasos, los dos coinciden
 * siempre por construcción.
 */
const DEFAULT_STEP_PX = 8;

export interface DragState {
  /**
   * Lo que se está arrastrando. Es una lista porque un grupo multi-red se
   * mueve entero: arrastrar una sola de sus redes lo rompía en silencio, que
   * es justo lo contrario de lo que el usuario ve (un bloque con tres redes
   * unidas por un borde). Todas comparten `scheduledAt` por definición del
   * grupo, así que la primera manda para calcular veredictos.
   */
  cards: PublicationCardDto[];
  /** Clave `YYYY-MM-DD` del día bajo el cursor, o null si no hay ninguno. */
  overDay: string | null;
  /**
   * Píxeles desde el borde superior del destino. En vista mes no significa
   * nada (una celda es un día entero); en semana y día el eje vertical ES la
   * hora, así que de acá sale el horario al que va a caer.
   *
   * Se mide contra el elemento completo, no contra su parte visible: la
   * columna mide las 24 h y vive dentro de un contenedor con scroll, así que
   * su `rect.top` puede ser negativo. Justamente por eso la cuenta da bien.
   */
  overOffsetY: number;
  /** El puntero está sobre la bandeja de borradores (ver `onDropDrafts`). */
  overDrafts: boolean;
}

interface UseDragScheduleOptions {
  /** Se llama al soltar sobre un destino válido. */
  onDrop: (cards: PublicationCardDto[], dayKey: string, offsetY: number) => void;
  /**
   * Soltar sobre la bandeja de borradores: el camino inverso al de programar.
   * Devuelve la publicación a borrador, igual que "Cancelar programación" del
   * menú. Ausente para lo que ya es borrador (no hay nada que deshacer).
   */
  onDropDrafts?: (cards: PublicationCardDto[]) => void;
  /**
   * Un destino sobre el que no se puede soltar. Se consulta en cada cambio
   * para decidir el cursor y para no invocar onDrop al final. Recibe el
   * offset porque en vista semana la validez depende de la HORA, no solo del
   * día: hoy a las 08:00 ya pasó, hoy a las 22:00 no.
   */
  isBlocked: (cards: PublicationCardDto[], dayKey: string, offsetY: number) => boolean;
}

export function useDragSchedule({ onDrop, onDropDrafts, isBlocked }: UseDragScheduleOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Los callbacks viven en un ref y no en las deps de `start`. El caller los
  // define inline —dependen de `cards`, que cambia en cada carga— así que
  // listarlos en deps le daba identidad nueva a `startDrag` en cada render, y
  // de ahí a `onStartDragCard` de las tres vistas: la grilla entera se
  // repintaba por cualquier cambio de estado de la página. El gesto los lee
  // al soltar, no al registrarse, así que un ref es correcto acá.
  const handlers = useRef({ onDrop, onDropDrafts, isBlocked });
  handlers.current = { onDrop, onDropDrafts, isBlocked };
  const ghostRef = useRef<HTMLDivElement | null>(null);
  /** Última posición conocida del puntero, para colocar el fantasma al montarlo. */
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  /** Cuándo terminó el último arrastre — ver justDragged. */
  const endedAt = useRef(0);
  // El estado vivo del gesto vive en un ref y no en el state: los handlers de
  // pointermove se registran una sola vez y no deben re-crearse por cada
  // cambio de celda.
  const gesture = useRef<{
    cards: PublicationCardDto[];
    overDay: string | null;
    overOffsetY: number;
    overDrafts: boolean;
    /** Último offset que llegó a provocar un render, para no hacer uno por píxel. */
    renderedOffsetY: number;
  } | null>(null);

  const moveGhost = useCallback((x: number, y: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    // translate3d y no top/left: se resuelve en el compositor y no dispara
    // layout en cada frame.
    ghost.style.transform = `translate3d(${String(x + 14)}px, ${String(y + 10)}px, 0) rotate(2.6deg)`;
  }, []);

  const start = useCallback(
    (event: React.PointerEvent, cards: PublicationCardDto[]) => {
      if (cards.length === 0) return;
      // Solo botón principal. El secundario abre el menú contextual del
      // navegador y no debe empezar un arrastre.
      if (event.button !== 0) return;
      const origin = { x: event.clientX, y: event.clientY };
      const el = event.currentTarget as HTMLElement;
      const pointerId = event.pointerId;
      let started = false;

      const onMove = (ev: PointerEvent) => {
        lastPoint.current = { x: ev.clientX, y: ev.clientY };
        if (!started) {
          const far =
            Math.abs(ev.clientX - origin.x) > DRAG_THRESHOLD ||
            Math.abs(ev.clientY - origin.y) > DRAG_THRESHOLD;
          if (!far) return;
          // El umbral es lo que deja convivir "click para ver" con
          // "arrastrar para mover" en el mismo elemento: sin él, cualquier
          // temblor de mano al hacer click iniciaría un gesto.
          started = true;
          el.setPointerCapture(pointerId);
          gesture.current = {
            cards,
            overDay: null,
            overOffsetY: 0,
            overDrafts: false,
            renderedOffsetY: 0,
          };
          document.body.dataset.dragging = "true";
          setDrag({ cards, overDay: null, overOffsetY: 0, overDrafts: false });
        }

        moveGhost(ev.clientX, ev.clientY);
        // elementFromPoint y no los eventos de entrada/salida de cada celda:
        // con el fantasma siguiendo al cursor, el pointer nunca "entra" a la
        // celda de abajo. El fantasma tiene pointer-events:none justamente
        // para que esta consulta atraviese hasta la grilla.
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = under?.closest<HTMLElement>("[data-drop-day]");
        const next = cell?.dataset.dropDay ?? null;
        const draftsZone = under?.closest("[data-drop-drafts]") ?? null;
        const overDrafts = handlers.current.onDropDrafts !== undefined && draftsZone !== null;
        const offsetY = cell ? ev.clientY - cell.getBoundingClientRect().top : 0;
        if (!gesture.current) return;
        // El offset SIEMPRE se guarda en el ref —al soltar hace falta el
        // exacto— pero solo provoca render cuando cambia algo que se ve.
        // El umbral se compara contra el último offset RENDERIZADO, no
        // contra el estado de React: `drag` acá sería la clausura del render
        // en que empezó el gesto, o sea null, y el umbral nunca cortaría
        // nada — un render por píxel, justo lo que este motor evita.
        gesture.current.overOffsetY = offsetY;
        const step = Number(cell?.dataset.dropTime) || DEFAULT_STEP_PX;
        const timed = cell?.dataset.dropTime !== undefined;
        const movedEnough =
          timed &&
          Math.round(offsetY / step) !== Math.round(gesture.current.renderedOffsetY / step);
        if (
          gesture.current.overDay !== next ||
          gesture.current.overDrafts !== overDrafts ||
          movedEnough
        ) {
          gesture.current.overDay = next;
          gesture.current.overDrafts = overDrafts;
          gesture.current.renderedOffsetY = offsetY;
          setDrag({ cards, overDay: next, overOffsetY: offsetY, overDrafts });
        }
      };

      const finish = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", finish);
        el.removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", cancel);
        document.removeEventListener("scroll", onScroll, { capture: true });
        if (!started) return;
        // El navegador dispara un `click` de compatibilidad después de todo
        // gesto de puntero, y `stopPropagation` en el pointerdown no lo
        // evita: son eventos distintos. Sin marcar el final del arrastre,
        // soltar una publicación abría además su propia vista, como si el
        // usuario le hubiera hecho click. Quien maneja el click consulta
        // justDragged() antes de actuar.
        endedAt.current = Date.now();
        delete document.body.dataset.dragging;
        const target = gesture.current?.overDay ?? null;
        const offsetY = gesture.current?.overOffsetY ?? 0;
        const toDrafts = gesture.current?.overDrafts ?? false;
        gesture.current = null;
        setDrag(null);
        if (toDrafts) {
          handlers.current.onDropDrafts?.(cards);
          return;
        }
        // Escape ya canceló, o se soltó fuera de la grilla, o sobre un
        // destino que no acepta: el fantasma desaparece y no pasa nada más.
        if (!target || handlers.current.isBlocked(cards, target, offsetY)) return;
        handlers.current.onDrop(cards, target, offsetY);
        void ev;
      };

      const cancel = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", finish);
        el.removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", cancel);
        document.removeEventListener("scroll", onScroll, { capture: true });
        if (!started) return;
        endedAt.current = Date.now();
        delete document.body.dataset.dragging;
        gesture.current = null;
        setDrag(null);
      };

      // El eje horario muestra ~10 de las 24 horas, así que para soltar en una
      // hora que no se ve HAY que scrollear a mitad del gesto. Una rueda de
      // mouse mueve el contenido pero no dispara pointermove: sin esto, el
      // offset guardado seguía siendo el de antes del scroll y la card caía
      // en la hora que estaba bajo el cursor ANTES de mover la rueda, con la
      // franja de preview mintiendo igual.
      const onScroll = () => {
        const point = lastPoint.current;
        if (!started || !gesture.current || !point) return;
        const under = document.elementFromPoint(point.x, point.y);
        const cell = under?.closest<HTMLElement>("[data-drop-day]");
        const day = cell?.dataset.dropDay ?? null;
        const offset = cell ? point.y - cell.getBoundingClientRect().top : 0;
        const overDrafts = gesture.current.overDrafts;
        gesture.current.overDay = day;
        gesture.current.overOffsetY = offset;
        gesture.current.renderedOffsetY = offset;
        setDrag({ cards, overDay: day, overOffsetY: offset, overDrafts });
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", cancel);
      el.addEventListener("lostpointercapture", cancel);
      // En captura y sobre document: el scroll ocurre en un contenedor
      // cualquiera del árbol y no burbujea.
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    },
    [moveGhost],
  );

  // El fantasma se monta en el render que dispara setDrag, así que en ese
  // primer frame ghostRef todavía es null y la escritura de onMove se pierde:
  // el fantasma aparecía un instante en la esquina superior izquierda antes
  // de saltar al cursor. Un layout effect lo coloca antes de pintar.
  useLayoutEffect(() => {
    if (!drag) return;
    const point = lastPoint.current;
    if (point) moveGhost(point.x, point.y);
  }, [drag, moveGhost]);

  // Si la ruta se desmonta a mitad del gesto (una navegación desde ⌘K, un
  // deep-link, un error boundary), nadie limpia el atributo y el
  // `cursor: grabbing; user-select: none` de body[data-dragging] se queda
  // pegado en TODA la app hasta recargar.
  useEffect(() => {
    return () => {
      delete document.body.dataset.dragging;
    };
  }, []);

  // Escape aborta el gesto. Sin esto, un arrastre iniciado por accidente solo
  // se puede terminar soltando en algún lado.
  useEffect(() => {
    if (!drag) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      gesture.current = null;
      delete document.body.dataset.dragging;
      setDrag(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [drag]);

  /**
   * ¿El click que estoy atendiendo es el de compatibilidad que dejó un
   * arrastre recién terminado? La ventana es corta a propósito: el click
   * llega en el mismo tick que el pointerup, y 250 ms no alcanzan para que
   * el usuario haga un click de verdad después de soltar.
   */
  const justDragged = useCallback(() => Date.now() - endedAt.current < 250, []);

  return { drag, startDrag: start, ghostRef, justDragged };
}
