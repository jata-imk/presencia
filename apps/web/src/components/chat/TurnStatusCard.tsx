import { CircleAlert, CircleStop, RefreshCw } from "lucide-react";
import type { TurnNotice } from "../../lib/turn-status.js";

// El estado de un turno que se quedó sin respuesta completa (F10.8.2,
// presencia-chat.md "IA falló"): va donde iría la respuesta, nunca un modal.
// Tres formas:
//
// - Turno viejo: una línea discreta, sin acciones (solo el último se reintenta).
// - Se detuvo con texto: lo escrito se queda y la línea va al pie, con
//   Reintentar. Es la respuesta, interrumpida: no un error.
// - Sin texto (se detuvo antes de empezar, o falló): una card sutil con la
//   salida explícita, porque sin ella el chat parece colgado.
//
// El copy no dice "la detuviste": el servidor no distingue Detener de cerrar
// la pestaña o perder la red.
export function TurnStatusCard({
  notice,
  failedAgain,
  apiError,
  onRetry,
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
}) {
  const stopped = notice.status === "stopped";

  if (!notice.actionable || (stopped && notice.partial)) {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted" role="status">
        {stopped ? (
          <CircleStop size={14} strokeWidth={1.75} aria-hidden />
        ) : (
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden />
        )}
        <span>{stopped ? "Respuesta detenida" : "Sin respuesta"}</span>
        {notice.actionable && (
          <>
            <span aria-hidden>·</span>
            <RetryButton onClick={onRetry} subtle />
          </>
        )}
      </div>
    );
  }

  const title = apiError
    ? apiError
    : stopped
      ? "Se detuvo la respuesta antes de empezar."
      : failedAgain
        ? "Sigue sin funcionar. Intenta en unos minutos."
        : "No se pudo generar la respuesta.";
  const hint = apiError
    ? "Escribe otro mensaje para seguir."
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
        {!apiError && (
          <div className="mt-2">
            <RetryButton onClick={onRetry} />
          </div>
        )}
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
          ? "inline-flex items-center gap-1 rounded-md px-1 font-semibold text-fg-secondary hover:text-fg"
          : "inline-flex h-7 items-center gap-1.5 rounded-md bg-card px-2.5 font-display text-xs font-semibold text-fg shadow-xs hover:bg-surface"
      }
    >
      <RefreshCw size={12} strokeWidth={2} aria-hidden />
      Reintentar
    </button>
  );
}
