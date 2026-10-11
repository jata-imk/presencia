import type { UIMessage } from "ai";
import { z } from "zod";
import { cardSummariesIn, type CompressedCardOutput } from "./context-diet.js";
import { estimateTextTokens } from "./text-tokens.js";

// Lo puro de la compactación del historial (F10.8; bloques desde F10.8.1): qué
// lee el modelo que resume y cómo se juntan las cards. Aparte del servicio para probarlo sin
// levantar env ni base.

/** Cuánto de cada mensaje lee el modelo que resume. */
const MAX_CHARS_PER_MESSAGE = 4_000;

/**
 * Un tramo resumido (F10.8.1). Los bloques se agregan, uno por compactación,
 * en vez de reescribir un único resumen: así no se resumen resúmenes (cada
 * pasada perdía detalle de la anterior) y el prefijo de los bloques viejos
 * sigue en la caché del proveedor. Fechas en ISO.
 */
export interface SummaryBlock {
  summary: string;
  /** El último mensaje que cubre este bloque. */
  throughMessageId: string;
  throughCreatedAt: string;
  model: string;
  createdAt: string;
}

/**
 * Cuando los bloques juntos pasan de esto, se consolidan en uno. Es la única
 * vez que el prefijo de resúmenes cambia entero (y la caché se pierde). Unos
 * 15 bloques: cientos de turnos.
 */
export const CONSOLIDATE_AT_TOKENS = 6_000;

/** Tokens aproximados de los bloques (~4 caracteres por token). */
export function blocksTokens(blocks: Pick<SummaryBlock, "summary">[]): number {
  return estimateTextTokens(blocks.reduce((total, block) => total + block.summary.length, 0));
}

/** "Parte 2 (hasta el 9 de octubre)", en la hora de Mérida; sin fecha si no la trae. */
export function blockHeading(index: number, block: { throughCreatedAt?: string | null }): string {
  const fecha = block.throughCreatedAt ? new Date(block.throughCreatedAt) : null;
  const hasta =
    fecha && !Number.isNaN(fecha.getTime())
      ? ` (hasta el ${fecha.toLocaleDateString("es-MX", { timeZone: "America/Merida", day: "numeric", month: "long" })})`
      : "";
  return `Parte ${String(index + 1)}${hasta}`;
}

const blockSchema = z.object({
  summary: z.string().min(1),
  throughMessageId: z.string(),
  throughCreatedAt: z.string(),
  model: z.string(),
  createdAt: z.string(),
});

/**
 * Los bloques de una fila de `chat_summaries`, validados: es jsonb, y un
 * bloque mal formado se descarta en vez de llegar al prompt. Si la fila no
 * tiene bloques pero sí el `summary` viejo (lo escribió la app anterior
 * durante el deploy de F10.8.1), ese texto es el bloque 1.
 */
export function blocksOf(row: {
  blocks: unknown;
  summary?: string | null;
  throughMessageId: string;
  throughCreatedAt: Date;
  model: string;
  updatedAt: Date;
}): SummaryBlock[] {
  const blocks = Array.isArray(row.blocks)
    ? row.blocks.flatMap((block) => {
        const parsed = blockSchema.safeParse(block);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  if (blocks.length > 0 || !row.summary) return blocks;
  return [
    {
      summary: row.summary,
      throughMessageId: row.throughMessageId,
      throughCreatedAt: row.throughCreatedAt.toISOString(),
      model: row.model,
      createdAt: row.updatedAt.toISOString(),
    },
  ];
}

export const SUMMARY_SYSTEM = `Resumes conversaciones entre un creator mexicano y Presencia, su asistente de contenido para redes sociales. Tu resumen sustituye a una parte vieja de la conversación: el asistente ya no la verá completa, solo los resúmenes.

Conserva todo lo que el asistente necesitaría para seguir ayudando sin preguntar de nuevo:
- El negocio o proyecto del creator y lo que ofrece (productos, precios, horarios, lugares, promociones).
- Lo que se decidió o se pactó, y lo que el creator rechazó o pidió evitar.
- Datos concretos tal cual: nombres, cifras, fechas, frases exactas que el creator quiere usar.
- El tono, estilo o formato que pidió.
- Lo que quedó pendiente o a medias.

No conserves saludos, rodeos ni explicaciones que ya no sirven. Escribe en español mexicano, en tercera persona ("El creator vende…"), en viñetas cortas agrupadas por tema, en no más de 300 palabras.

Si te dan resúmenes anteriores, son de solo lectura: el asistente ya los tiene. No los repitas. Escribe solo lo nuevo de este tramo, y si algo cambió respecto a lo anterior, dilo explícito ("Cambió: ahora abre a las 8").`;

export const CONSOLIDATE_SYSTEM = `Juntas en uno solo los resúmenes por partes de una conversación entre un creator mexicano y Presencia, su asistente de contenido para redes sociales. El resultado reemplaza a todas las partes.

Conserva todo lo que sigue vigente: el negocio y lo que ofrece, lo decidido o rechazado, los datos concretos tal cual, el tono pedido y lo pendiente. Cuando una parte posterior cambia algo de una anterior, gana la posterior: escribe solo el dato vigente. Quita lo que ya se resolvió y no vuelve a importar.

Escribe en español mexicano, en tercera persona, en viñetas cortas agrupadas por tema, en no más de 600 palabras.`;

/** El texto visible de un mensaje, en una línea (sin tools ni razonamiento). También lo usa el título. */
export function textOf(message: UIMessage): string {
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

/** Las partes con su encabezado y en orden: así se sabe cuál dato es el más reciente. */
function partes(blocks: Pick<SummaryBlock, "summary" | "throughCreatedAt">[]): string {
  return blocks.map((block, i) => `${blockHeading(i, block)}:\n${block.summary}`).join("\n\n");
}

export function summaryPrompt(previous: SummaryBlock[], transcript: string): string {
  const anteriores =
    previous.length > 0
      ? `Resúmenes anteriores (solo de referencia, no los repitas; si dos dicen distinto, vale el más reciente):\n${partes(previous)}\n\n`
      : "";
  return `${anteriores}Conversación a resumir:\n${transcript}`;
}

export function consolidatePrompt(blocks: SummaryBlock[]): string {
  return partes(blocks);
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
