import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_CHARS, attachmentIdFromUrl } from "@presencia/shared";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { attachmentIdsIn } from "./attachment-context.js";

const uuidSchema = z.uuid();

/**
 * El mensaje del creator al que hay que responder: el último del body. El
 * resto del historial se reconstruye desde la DB (fuente de verdad única).
 *
 * Texto y, desde F10.9, adjuntos: partes `file` cuya URL es la de un adjunto
 * ya subido (`/api/attachments/:id/content`), nunca bytes en línea. El tope de
 * caracteres mide el texto; los adjuntos tienen el suyo (cuántos aquí, cuánto
 * pesan en ChatService, que lee sus filas). Cualquier otra parte se rechaza:
 * esquivaría los dos.
 */
export async function parseLastUserMessage(body: unknown): Promise<UIMessage> {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BadRequestException("Falta el mensaje.");
  }
  const validated = await safeValidateUIMessages({ messages: [messages.at(-1)] });
  const message = validated.success ? validated.data[0] : undefined;
  if (
    !message ||
    message.role !== "user" ||
    message.parts.length === 0 ||
    message.parts.some(
      (part) => part.type !== "text" && !(part.type === "file" && attachmentIdFromUrl(part.url)),
    )
  ) {
    throw new BadRequestException("El mensaje no es válido.");
  }
  if (attachmentIdsIn([message]).length > ATTACHMENTS_PER_MESSAGE) {
    throw new BadRequestException(
      `Puedes adjuntar hasta ${ATTACHMENTS_PER_MESSAGE} archivos por mensaje.`,
    );
  }
  if (textLengthOf(message) > MAX_MESSAGE_CHARS) {
    throw new PayloadTooLargeException(
      `Tu mensaje es demasiado largo. El máximo es de ${MAX_MESSAGE_CHARS.toLocaleString("es-MX")} caracteres.`,
    );
  }
  return message;
}

/**
 * El id con el que se guarda el mensaje: el de la web, que desde F10.8.2 es
 * un uuid. Así web y base nombran igual al mensaje, y "Regenerar" lo
 * encuentra sin recargar. `undefined` (la base genera uno, como antes) si no
 * es uuid: una pestaña abierta con el bundle anterior al deploy todavía manda
 * el id corto del SDK, y rechazarlo la dejaría sin poder escribir hasta
 * recargar. Se puede quitar un release después de F10.8.2.
 */
export function storableMessageId(message: UIMessage): string | undefined {
  return uuidSchema.safeParse(message.id).success ? message.id : undefined;
}

function textLengthOf(message: UIMessage): number {
  return message.parts.reduce(
    (total, part) => total + (part.type === "text" ? part.text.length : 0),
    0,
  );
}

/**
 * El último turno del chat, si `userMessageId` es su mensaje del creator: el
 * último de la conversación (se quedó sin respuesta guardada) o el penúltimo,
 * seguido de su respuesta. Solo el último turno se vuelve a correr: hacerlo
 * con uno de en medio dejaría un hueco (dos mensajes del creator seguidos)
 * sin tocar los turnos posteriores.
 */
export function lastTurnOf<M extends { id: string; role: string }>(
  all: M[],
  userMessageId: string,
): { index: number; staleReply: M | undefined } | null {
  const index = all.findIndex((m) => m.id === userMessageId);
  if (index === -1 || all[index]!.role !== "user") return null;
  const staleReply = all[index + 1];
  if (index === all.length - 1) return { index, staleReply: undefined };
  if (index === all.length - 2 && staleReply?.role === "assistant") return { index, staleReply };
  return null;
}
