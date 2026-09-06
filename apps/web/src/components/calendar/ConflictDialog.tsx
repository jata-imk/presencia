import { AlertTriangle } from "lucide-react";
import type { PublicationCardDto } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Modal } from "../ui/Modal.js";
import { formatDayLong, formatTime } from "../../lib/calendar/tz.js";
import type { ZonedDateTime } from "@internationalized/date";
import { toCalendarDate } from "@internationalized/date";

// Conflicto al soltar (presencia-calendario.md §3).
//
// La app detecta el choque pero NO lo bloquea: el usuario podría querer dos
// publicaciones a la misma hora a propósito, y decidirlo es suyo. Lo que sí
// hace es proponer la salida más probable (+30 min) para que resolverlo sea
// un click y no una búsqueda.
//
// Ámbar y no rojo, acá y en el resto del módulo: esto es información, no un
// error. El usuario está informado, no castigado.
//
// Es un diálogo centrado y no un popover anclado a la celda como el mockup:
// anclar exigiría una cuarta clase de flotante (ADR-015 tiene dos, más el
// inspector de PR2) y la ganancia era señalar el día — que el texto ya dice
// con todas las letras.

export function ConflictDialog({
  cards,
  network,
  target,
  suggestion,
  onAccept,
  onForce,
  onPickAnother,
  onCancel,
}: {
  /** Lo que se está programando: un grupo multi-red viaja entero. */
  cards: PublicationCardDto[];
  /**
   * La red que de verdad choca. En un grupo puede no ser la primera: un
   * grupo de LinkedIn+Instagram que cae sobre un Instagram ya programado
   * choca en Instagram, y nombrar al líder sería decirle al usuario que
   * revise la red equivocada.
   */
  network?: PublicationCardDto["network"];
  target: ZonedDateTime;
  suggestion: ZonedDateTime;
  onAccept: () => void;
  /** Programar en la hora original, aceptando el choque. */
  onForce: () => void;
  onPickAnother: () => void;
  onCancel: () => void;
}) {
  const meta = NETWORK_META[network ?? cards[0]!.network];
  const day = formatDayLong(toCalendarDate(target)).toLowerCase();

  return (
    <Modal onClose={onCancel} labelledBy="conflict-title" maxWidth="max-w-[380px]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-bg">
            <AlertTriangle size={17} strokeWidth={2} className="text-warning" />
          </span>
          <h2 id="conflict-title" className="font-display text-[15px] font-bold text-fg">
            Conflicto de horario
          </h2>
        </div>

        <p className="text-[13px] leading-relaxed text-fg-secondary">
          Ya tienes una publicación de <strong className="text-fg">{meta.label}</strong> el {day} a
          las <strong className="text-fg">{formatTime(target)}</strong>.
        </p>
        <p className="font-display text-[13px] font-semibold text-brand">
          ¿La programamos a las {formatTime(suggestion)}?
        </p>

        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-display text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Cambiar la hora a las {formatTime(suggestion)}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPickAnother}
              className="flex-1 rounded-lg border-[1.5px] border-line bg-card px-3 py-2 font-display text-[12.5px] font-semibold text-brand transition-colors hover:bg-secondary"
            >
              Elegir otra hora
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg px-3 py-2 font-display text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-secondary hover:text-brand"
            >
              Cancelar
            </button>
          </div>
          {/* Cuarta salida, con la jerarquía más baja de las cuatro: un
              conflicto informa y nunca bloquea (§4), pero dejar dos posts de
              la misma red a la misma hora es lo excepcional, no lo esperado.
              Sin esto, quien de verdad quería el choque tenía que rendirse y
              repetir la hora a mano en el drawer. */}
          <button
            type="button"
            onClick={onForce}
            className="rounded-lg px-3 py-1.5 text-center font-display text-[12px] font-medium text-fg-muted underline underline-offset-2 transition-colors hover:text-brand"
          >
            Programar de todas formas a las {formatTime(target)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
