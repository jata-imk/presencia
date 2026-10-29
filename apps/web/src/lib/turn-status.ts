import {
  isCardToolPart,
  isMemoryToolPart,
  isWebToolPart,
  type ChatUIMessage,
} from "./chat-types.js";

/**
 * Cómo se quedó un turno sin respuesta completa (F10.8.2). `stopped`: se cortó
 * (Detener, la red, cerrar la pestaña). `failed`: falló al generar, o no hay
 * respuesta guardada.
 */
export type TurnStatus = "stopped" | "failed";

/**
 * Qué alcanzó a quedar en pantalla de la respuesta (F10.8.3), con la misma
 * regla que usa AssistantMessage para pintar: texto, o tools (cards, la línea
 * de pasos, la nota de memoria), o nada. Lo demás (marcas de paso,
 * razonamiento) no se pinta.
 */
export type ReplyContent = "none" | "tools" | "text";

export interface TurnNotice {
  status: TurnStatus;
  /** Lo que la respuesta alcanzó a mostrar; decide el copy y la forma del estado. */
  content: ReplyContent;
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
      content: reply ? replyContent(reply) : "none",
      hasReply: reply !== undefined,
      actionable,
    });
  });
  return notices;
}

/** Lo que una respuesta muestra: texto, solo tools, o nada. */
export function replyContent(message: ChatUIMessage): ReplyContent {
  if (message.parts.some((part) => part.type === "text" && part.text.trim().length > 0)) {
    return "text";
  }
  // F10.10: leer y buscar también se ven (la línea de pasos de Steps.tsx).
  if (
    message.parts.some(
      (part) => isCardToolPart(part) || isMemoryToolPart(part) || isWebToolPart(part),
    )
  ) {
    return "tools";
  }
  return "none";
}
