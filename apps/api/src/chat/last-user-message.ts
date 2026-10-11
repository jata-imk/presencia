import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

const messageIdSchema = z.uuid();

/**
 * El mensaje del creator al que hay que responder: el último del body. El
 * resto del historial se reconstruye desde la DB (fuente de verdad única).
 *
 * Su id lo genera la web (uuid, F10.8.2) y es el mismo con el que se guarda:
 * así un "Regenerar" justo después del turno encuentra la fila sin recargar.
 */
export async function parseLastUserMessage(body: unknown): Promise<UIMessage> {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new BadRequestException("Falta el mensaje.");
  }
  const validated = await safeValidateUIMessages({ messages: [messages.at(-1)] });
  const message = validated.success ? validated.data[0] : undefined;
  if (!message || message.role !== "user" || !messageIdSchema.safeParse(message.id).success) {
    throw new BadRequestException("El mensaje no es válido.");
  }
  if (textLengthOf(message) > MAX_MESSAGE_CHARS) {
    throw new PayloadTooLargeException(
      `Tu mensaje es demasiado largo. El máximo es de ${MAX_MESSAGE_CHARS.toLocaleString("es-MX")} caracteres.`,
    );
  }
  return message;
}

function textLengthOf(message: UIMessage): number {
  return message.parts.reduce(
    (total, part) => total + (part.type === "text" ? part.text.length : 0),
    0,
  );
}
