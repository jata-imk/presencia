import type { UIMessage } from "ai";
import { statusOf } from "./chat-summary.js";
import { isSyntheticMessage } from "./history-window.js";

// Los turnos que se quedaron sin respuesta completa (F10.8.2), como los ve el
// modelo. No se quitan (decisión de Jose, plan de F10.8.2): si el siguiente
// mensaje del creator es "para Instagram", el pedido viejo es su contexto. Se
// marcan para que el modelo no los conteste como si siguieran pendientes ni
// retome solo una respuesta cortada.

const NOTE_STOPPED =
  "[Esta respuesta se detuvo aquí, antes de terminar: el creator la cortó o se perdió la conexión. No la continúes a menos que te lo pida.]";
const NOTE_FAILED =
  "[Esta respuesta no se completó por un error técnico. No la retomes a menos que el creator te lo pida.]";
const NOTE_NO_REPLY =
  "[Este mensaje se quedó sin respuesta por un error técnico. No lo contestes a menos que el creator te lo pida de nuevo.]";

/**
 * El historial con cada respuesta cortada o fallida marcada al final, y una
 * respuesta sintética entre dos mensajes seguidos del creator (el primero se
 * quedó sin respuesta: un turno de antes de F10.8.2, o uno que cayó con el
 * servidor). Así los roles siguen alternando. Nunca toca el último mensaje,
 * que es el turno actual.
 */
export function markUnansweredTurns(messages: UIMessage[]): UIMessage[] {
  return messages.flatMap((message, i): UIMessage[] => {
    if (message.role === "assistant" && !isSyntheticMessage(message)) {
      const status = statusOf(message);
      if (status === "complete") return [message];
      const note = status === "stopped" ? NOTE_STOPPED : NOTE_FAILED;
      return [{ ...message, parts: [...message.parts, { type: "text", text: note }] }];
    }
    const next = messages[i + 1];
    if (message.role === "user" && next?.role === "user") {
      return [
        message,
        {
          id: `presencia-sin-respuesta-${message.id}`,
          role: "assistant",
          parts: [{ type: "text", text: NOTE_NO_REPLY }],
        },
      ];
    }
    return [message];
  });
}
