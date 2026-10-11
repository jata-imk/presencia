import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { useEffect, type KeyboardEvent, type RefObject } from "react";

// Lo que comparten las dos cajas donde se escribe un mensaje: el composer y
// la burbuja en modo edición (F10.8.2).

/** Alto máximo de la caja antes de hacer scroll dentro. */
export const MESSAGE_INPUT_MAX_HEIGHT_PX = 220;

/** La caja crece con el texto, hasta el máximo. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${String(Math.min(el.scrollHeight, MESSAGE_INPUT_MAX_HEIGHT_PX))}px`;
  }, [ref, value]);
}

/**
 * Cuánto mide lo que de verdad se manda (el envío recorta los bordes) y si se
 * puede mandar. Pasarse del tope no corta el texto: un `maxLength` recortaría
 * en silencio lo pegado.
 */
export function measureMessage(value: string): {
  length: number;
  tooLong: boolean;
  canSend: boolean;
} {
  const length = value.trim().length;
  const tooLong = length > MAX_MESSAGE_CHARS;
  return { length, tooLong, canSend: length > 0 && !tooLong };
}

/**
 * Enter envía, Shift+Enter es salto de línea. No mientras se compone con un
 * IME o una tecla muerta: ese Enter confirma el carácter, no el mensaje.
 */
export function isSubmitKey(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}
