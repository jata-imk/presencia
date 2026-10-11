import type { ChatUIMessage } from "./chat-types.js";

/**
 * Cómo se quedó un turno sin respuesta completa (F10.8.2). `stopped`: se cortó
 * (Detener, la red, cerrar la pestaña). `failed`: falló al generar, o no hay
 * respuesta guardada.
 */
export type TurnStatus = "stopped" | "failed";

export interface TurnNotice {
  status: TurnStatus;
  /** La respuesta alcanzó a escribir texto: se ve, y la card va al pie. */
  partial: boolean;
  /** Hay una respuesta del asistente en pantalla (vacía o no). */
  hasReply: boolean;
  /** El último turno: el único que se puede reintentar o editar. */
  actionable: boolean;
}

export interface LiveTurnState {
  /** Hay un turno en curso: el último no tiene estado todavía. */
  busy: boolean;
  /**
   * Lo que pasó en esta sesión, por id del mensaje del creator: Detener, o
   * el `error` de useChat. Manda sobre lo guardado: la respuesta en pantalla
   * de un turno en vivo no trae `metadata`.
   */
  local: ReadonlyMap<string, TurnStatus>;
}

/**
 * Los turnos que se quedaron sin respuesta completa, por id del mensaje del
 * creator. En vivo manda lo que pasó en esta sesión; al recargar, lo que
 * guardó el servidor (`metadata.status`). Un mensaje del creator sin respuesta
 * guardada (seguido de otro suyo, o el último sin turno en curso) se quedó sin
 * respuesta: un turno de antes de F10.8.2, uno que cayó con el servidor o uno
 * que se cortó antes de llegar.
 */
export function turnNotices(
  messages: ChatUIMessage[],
  live: LiveTurnState,
): Map<string, TurnNotice> {
  const notices = new Map<string, TurnNotice>();
  messages.forEach((message, i) => {
    if (message.role !== "user") return;
    const next = messages[i + 1];
    const reply = next?.role === "assistant" ? next : undefined;
    const actionable = (reply ? i + 1 : i) === messages.length - 1;
    if (actionable && live.busy) return;

    const status: TurnStatus | undefined =
      live.local.get(message.id) ?? reply?.metadata?.status ?? (reply ? undefined : "failed");
    if (!status) return;

    notices.set(message.id, {
      status,
      partial: reply ? hasText(reply) : false,
      hasReply: reply !== undefined,
      actionable,
    });
  });
  return notices;
}

function hasText(message: ChatUIMessage): boolean {
  return message.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
}

/**
 * Una respuesta sin nada que pintar (F10.8.3): ni texto ni tools, solo marcas
 * de paso o razonamiento (que la UI no muestra). Una cortada antes de la
 * primera palabra se guarda así; pintarla igual dejaba un hueco entre el
 * mensaje y su estado. Una tool a medias sí cuenta: Steps dice que se detuvo.
 */
export function isEmptyReply(message: ChatUIMessage): boolean {
  return message.parts.every(
    (part) =>
      part.type === "step-start" ||
      part.type === "reasoning" ||
      (part.type === "text" && part.text.trim().length === 0),
  );
}
