import { CircleAlert, CircleStop, Pencil, RefreshCw } from "lucide-react";
import type { TurnNotice } from "../../lib/turn-status.js";

// El estado de un turno que se quedó sin respuesta completa (F10.8.2,
// presencia-chat.md "IA falló"): va donde iría la respuesta, nunca un modal.
// Tres formas:
//
// - Turno viejo: una pastilla discreta, sin acciones (solo el último se
//   reintenta). Desde F10.8.3 dice qué pasó, contra lo que se ve arriba:
//   "Se detuvo antes de responder" / "Respuesta detenida" (se cortó, sin o
//   con algo en pantalla) y "Sin respuesta" / "Respuesta incompleta" (falló).
// - Se detuvo con algo en pantalla (texto o cards): se queda, y la pastilla va
//   al pie con Reintentar. Es la respuesta, interrumpida: no un error.
// - Se detuvo sin nada en pantalla, o falló (con o sin algo escrito): una
//   card sutil con la salida explícita, porque sin ella el chat parece colgado.
//
// El copy no dice "la detuviste": el servidor no distingue Detener de cerrar
// la pestaña o perder la red.
export function TurnStatusCard({
  notice,
  failedAgain,
  apiError,
  onRetry,
  onEdit,
}: {
  notice: TurnNotice;
  /** El reintento de esta sesión volvió a fallar. */
  failedAgain: boolean;
  /**
   * El rechazo de la API en español (413, 409…): no se guardó nada, así que
   * reintentar tal cual daría lo mismo y no se ofrece.
   */
  apiError: string | null;
  onRetry: () => void;
  /** Abre el último mensaje en modo edición (F10.8.2); sin él, no se ofrece. */
  onEdit?: () => void;
}) {
  const stopped = notice.status === "stopped";
  // Lo que la respuesta alcanzó a mostrar (texto, o cards/pasos/memoria).
  const shown = notice.content !== "none";

  if (!notice.actionable || (stopped && shown)) {
    // Una pastilla (F10.8.3): el texto gris suelto parecía un residuo de la
    // interfaz, no un estado. El copy dice qué pasó en cada caso, contra lo
    // que se ve arriba: "detenida" sola sugería un texto cortado aunque no
    // hubiera ninguno, y "sin respuesta" debajo de dos párrafos mentía.
    const label = stopped
      ? shown
        ? "Respuesta detenida"
        : "Se detuvo antes de responder"
      : shown
        ? "Respuesta incompleta"
        : "Sin respuesta";
    return (
      <div className="flex flex-wrap items-center gap-2" role="status">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg-secondary">
          {stopped ? (
            <CircleStop size={13} strokeWidth={1.75} aria-hidden />
          ) : (
            <CircleAlert size={13} strokeWidth={1.75} aria-hidden />
          )}
          {label}
        </span>
        {notice.actionable && <RetryButton onClick={onRetry} subtle />}
      </div>
    );
  }

  const title = apiError
    ? apiError
    : stopped
      ? "Se detuvo la respuesta antes de empezar."
      : failedAgain
        ? "Sigue sin funcionar. Intenta en unos minutos."
        : shown
          ? "No se pudo terminar la respuesta."
          : "No se pudo generar la respuesta.";
  const hint = apiError
    ? onEdit
      ? "Edita tu mensaje o escribe otro para seguir."
      : "Escribe otro mensaje para seguir."
    : onEdit
      ? "Reintenta, edita tu mensaje o escribe otro para seguir."
      : "Reintenta, o escribe otro mensaje para seguir.";

  return (
    <div
      role={stopped ? "status" : "alert"}
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px] leading-normal text-fg ${
        stopped ? "bg-info-bg" : "bg-error-bg"
      }`}
    >
      {stopped ? (
        <CircleStop size={15} aria-hidden className="mt-px shrink-0 text-info" />
      ) : (
        <CircleAlert size={15} aria-hidden className="mt-px shrink-0 text-error" />
      )}
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-fg-secondary">{hint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!apiError && <RetryButton onClick={onRetry} />}
          {onEdit && (
            <button type="button" onClick={onEdit} className={CARD_BUTTON}>
              <Pencil size={12} strokeWidth={2} aria-hidden />
              Editar mensaje
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RetryButton({ onClick, subtle = false }: { onClick: () => void; subtle?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        subtle
          ? "inline-flex items-center gap-1 rounded-md px-1 text-xs font-semibold text-fg-secondary hover:text-fg"
          : CARD_BUTTON
      }
    >
      <RefreshCw size={12} strokeWidth={2} aria-hidden />
      Reintentar
    </button>
  );
}

const CARD_BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-md bg-card px-2.5 font-display text-xs font-semibold text-fg shadow-xs hover:bg-surface";
