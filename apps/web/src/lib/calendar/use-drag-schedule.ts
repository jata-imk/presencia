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

export interface DragState {
  card: PublicationCardDto;
  /** Clave `YYYY-MM-DD` del día bajo el cursor, o null si no hay ninguno. */
  overDay: string | null;
}

interface UseDragScheduleOptions {
  /** Se llama al soltar sobre un día válido. */
  onDrop: (card: PublicationCardDto, dayKey: string) => void;
  /**
   * Un día sobre el que no se puede soltar. Se consulta en cada cambio de
   * celda para decidir el cursor y para no invocar onDrop al final.
   */
  isBlocked: (card: PublicationCardDto, dayKey: string) => boolean;
}

export function useDragSchedule({ onDrop, isBlocked }: UseDragScheduleOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  /** Última posición conocida del puntero, para colocar el fantasma al montarlo. */
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  /** Cuándo terminó el último arrastre — ver justDragged. */
  const endedAt = useRef(0);
  // El estado vivo del gesto vive en un ref y no en el state: los handlers de
  // pointermove se registran una sola vez y no deben re-crearse por cada
  // cambio de celda.
  const gesture = useRef<{ card: PublicationCardDto; overDay: string | null } | null>(null);

  const moveGhost = useCallback((x: number, y: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    // translate3d y no top/left: se resuelve en el compositor y no dispara
    // layout en cada frame.
    ghost.style.transform = `translate3d(${String(x + 14)}px, ${String(y + 10)}px, 0) rotate(2.6deg)`;
  }, []);

  const start = useCallback(
    (event: React.PointerEvent, card: PublicationCardDto) => {
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
          gesture.current = { card, overDay: null };
          document.body.dataset.dragging = "true";
          setDrag({ card, overDay: null });
        }

        moveGhost(ev.clientX, ev.clientY);
        // elementFromPoint y no los eventos de entrada/salida de cada celda:
        // con el fantasma siguiendo al cursor, el pointer nunca "entra" a la
        // celda de abajo. El fantasma tiene pointer-events:none justamente
        // para que esta consulta atraviese hasta la grilla.
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = under?.closest<HTMLElement>("[data-drop-day]");
        const next = cell?.dataset.dropDay ?? null;
        if (gesture.current && gesture.current.overDay !== next) {
          gesture.current.overDay = next;
          setDrag({ card, overDay: next });
        }
      };

      const finish = (ev: PointerEvent) => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", finish);
        el.removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", cancel);
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
        gesture.current = null;
        setDrag(null);
        // Escape ya canceló, o se soltó fuera de la grilla, o sobre un día
        // que no acepta: el fantasma desaparece y no pasa nada más.
        if (!target || isBlocked(card, target)) return;
        onDrop(card, target);
        void ev;
      };

      const cancel = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", finish);
        el.removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", cancel);
        if (!started) return;
        endedAt.current = Date.now();
        delete document.body.dataset.dragging;
        gesture.current = null;
        setDrag(null);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", cancel);
      el.addEventListener("lostpointercapture", cancel);
    },
    [isBlocked, moveGhost, onDrop],
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
