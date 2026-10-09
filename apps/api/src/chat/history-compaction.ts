import type { UIMessage } from "ai";
import { cardSummariesIn, type CompressedCardOutput } from "./context-diet.js";

// Lo puro de la compactación del historial (F10.8): qué lee el modelo que
// resume y cómo se juntan las cards. Aparte del servicio para probarlo sin
// levantar env ni base.

/** Cuánto de cada mensaje lee el modelo que resume. */
const MAX_CHARS_PER_MESSAGE = 4_000;

export const SUMMARY_SYSTEM = `Resumes conversaciones entre un creator mexicano y Presencia, su asistente de contenido para redes sociales. Tu resumen sustituye a la parte vieja de la conversación: el asistente ya no la verá completa, solo tu resumen.

Conserva todo lo que el asistente necesitaría para seguir ayudando sin preguntar de nuevo:
- El negocio o proyecto del creator y lo que ofrece (productos, precios, horarios, lugares, promociones).
- Lo que se decidió o se pactó, y lo que el creator rechazó o pidió evitar.
- Datos concretos tal cual: nombres, cifras, fechas, frases exactas que el creator quiere usar.
- El tono, estilo o formato que pidió.
- Lo que quedó pendiente o a medias.

No conserves saludos, rodeos ni explicaciones que ya no sirven. Escribe en español mexicano, en tercera persona ("El creator vende…"), en viñetas cortas agrupadas por tema, en no más de 500 palabras. Si te dan un resumen anterior, intégralo: el resultado reemplaza a los dos.`;

function textOf(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El tramo a resumir como texto: quién dijo qué, y las publicaciones como una
 * línea (no el JSON de la tool). Sin razonamiento: es del modelo, no de la
 * conversación.
 */
export function transcriptForSummary(messages: UIMessage[]): string {
  return messages
    .flatMap((message) => {
      const lines: string[] = [];
      const text = textOf(message).slice(0, MAX_CHARS_PER_MESSAGE);
      if (text) lines.push(`${message.role === "user" ? "Creator" : "Presencia"}: ${text}`);
      for (const card of cardSummariesIn([message])) {
        lines.push(
          `[Presencia creó o actualizó una publicación de ${card.network}: ${card.resumen}]`,
        );
      }
      return lines;
    })
    .join("\n\n");
}

export function summaryPrompt(previous: string | null, transcript: string): string {
  const anterior = previous ? `Resumen anterior:\n${previous}\n\n` : "";
  return `${anterior}Conversación a resumir:\n${transcript}`;
}

/** Las cards del resumen anterior más las del tramo nuevo; la más reciente gana. */
export function mergeCards(
  previous: CompressedCardOutput[],
  next: CompressedCardOutput[],
): CompressedCardOutput[] {
  const byId = new Map(previous.map((card) => [card.cardId, card]));
  for (const card of next) {
    byId.delete(card.cardId);
    byId.set(card.cardId, card);
  }
  return [...byId.values()];
}

/**
 * Lo grande que fue el contexto del turno: la entrada del PASO más grande, no
 * la suma. Un turno con tools hace varias llamadas y `totalUsage` las suma,
 * así que contaría el mismo historial dos o tres veces.
 */
export function contextTokensOf(steps: { usage: { inputTokens?: number } }[]): number {
  return Math.max(0, ...steps.map((step) => step.usage.inputTokens ?? 0));
}

/**
 * Lo más que se resume en una llamada (~50k tokens). El primer resumen de un
 * chat que ya era larguísimo antes de F10.8 (o uno que se quedó atrás porque
 * el job falló varias veces) no se manda entero: se resume el principio y el
 * siguiente turno que pase del umbral continúa desde ahí.
 */
export const MAX_TRAMO_CHARS = 200_000;

/**
 * El principio del tramo que cabe en `maxChars` de transcript, cortado antes
 * de un mensaje del creator para no partir un turno. Siempre avanza: si el
 * primer intercambio solo ya no cabe, va ese (cada mensaje se trunca a 4,000
 * caracteres en el transcript, así que nunca es enorme).
 */
export function boundedTramo(tramo: UIMessage[], maxChars = MAX_TRAMO_CHARS): UIMessage[] {
  let total = 0;
  let end = 0;
  while (end < tramo.length) {
    const size = transcriptForSummary([tramo[end]!]).length + 2;
    if (end > 0 && total + size > maxChars) break;
    total += size;
    end++;
  }
  while (end > 0 && end < tramo.length && tramo[end]!.role !== "user") end--;
  return end === 0 ? tramo.slice(0, Math.min(2, tramo.length)) : tramo.slice(0, end);
}
