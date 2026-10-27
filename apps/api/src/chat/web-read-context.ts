import type { UIMessage } from "ai";
import { READ_LINK_TOOL_NAME, type ReadLinkOutput } from "@presencia/shared";
import type { WebReadRow } from "../web/web-reads.repository.js";
import { KEEP_ATTACHMENT_USER_TURNS, recentTurnsStart } from "./attachment-context.js";

// F10.10 (ADR-028): cómo viajan al modelo las páginas leídas en turnos
// anteriores. Funciones puras, como attachment-context.ts.
//
// La parte de `leer_enlace` guarda solo la referencia. Antes del techo
// (capHistory) esta dieta le pega lo que el modelo debe ver —el texto, o una
// línea— para que el techo cuente su tamaño real; `toModelOutput` de la tool
// solo le da forma. Sin esto, cada página leída en el chat viajaría completa
// en cada turno y el techo no la vería.
//
// Misma ventana que los adjuntos (los últimos 3 turnos del creator), con un
// presupuesto propio: dentro van completas las que quepan, de la más nueva a
// la más vieja; fuera, una línea. Releerla es gratis (caché de `web_reads`).

/** Lo que ve el modelo de una página, como máximo (~6k tokens). Se guarda más. */
export const WEB_READ_MODEL_CHARS = 24_000;

/** Lo que pueden sumar, completas, las páginas de turnos anteriores. */
export const RECENT_WEB_READ_TOKENS = 12_000;

const CHARS_PER_TOKEN = 4;

/** Lo que la dieta y la tool necesitan de una fila: sin user_id ni fechas. */
export type WebReadForContext = Pick<
  WebReadRow,
  | "id"
  | "url"
  | "finalUrl"
  | "title"
  | "siteName"
  | "extractedText"
  | "truncated"
  | "onlyDescription"
  | "tokenEstimate"
  | "description"
>;

/** Cómo debe ver el modelo una lectura buena. */
export type PageView =
  | {
      vista: "completa";
      texto: string;
      titulo: string | null;
      sitio: string | null;
      urlFinal: string;
      /** Solo el inicio: se guardó cortada o pasa del tope del modelo. */
      recortada: boolean;
      soloDescripcion: boolean;
    }
  | { vista: "linea"; descripcion: string | null }
  | { vista: "no_disponible" };

/** El output de la parte después de la dieta. Solo existe del lado del modelo. */
export type ReadLinkModelOutput = ReadLinkOutput & { contexto?: PageView };

const PART_TYPE = `tool-${READ_LINK_TOOL_NAME}`;

type ReadPart = {
  type: string;
  state: "output-available";
  output: ReadLinkModelOutput;
};

function isGoodRead(
  part: UIMessage["parts"][number],
): part is UIMessage["parts"][number] & ReadPart {
  if (part.type !== PART_TYPE) return false;
  const p = part as Partial<ReadPart>;
  return p.state === "output-available" && p.output?.estado === "ok" && Boolean(p.output.readId);
}

/** Las lecturas buenas que citan los mensajes, sin repetir. */
export function webReadIdsIn(messages: UIMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (isGoodRead(part)) ids.add(part.output.readId!);
    }
  }
  return [...ids];
}

export function fullView(row: WebReadForContext): PageView {
  const text = row.extractedText ?? "";
  return {
    vista: "completa",
    texto: text.length > WEB_READ_MODEL_CHARS ? `${text.slice(0, WEB_READ_MODEL_CHARS)}…` : text,
    titulo: row.title,
    sitio: row.siteName,
    urlFinal: row.finalUrl ?? row.url,
    recortada: row.truncated || text.length > WEB_READ_MODEL_CHARS,
    soloDescripcion: row.onlyDescription,
  };
}

/** Lo que cuesta, completa, una página en el contexto: nunca más que el tope del modelo. */
function costOf(row: WebReadForContext): number {
  return Math.min(row.tokenEstimate, Math.ceil(WEB_READ_MODEL_CHARS / CHARS_PER_TOKEN));
}

/**
 * Las lecturas de cada mensaje, como deben viajar. `rows` es `null` si la
 * lectura falló: cada página queda nombrada, sin su texto.
 */
export function dietWebReads(
  messages: UIMessage[],
  rows: ReadonlyMap<string, WebReadForContext> | null,
  keep = KEEP_ATTACHMENT_USER_TURNS,
  budget = RECENT_WEB_READ_TOKENS,
): UIMessage[] {
  const full = fullReadIds(messages, rows, keep, budget);
  return messages.map((message) => {
    if (!message.parts.some(isGoodRead)) return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isGoodRead(part)) return part;
        const row = rows?.get(part.output.readId!);
        const contexto: PageView = !row
          ? { vista: "no_disponible" }
          : full.has(row.id)
            ? fullView(row)
            : { vista: "linea", descripcion: row.description };
        return { ...part, output: { ...part.output, contexto } };
      }),
    };
  });
}

/** Las que van completas: en la ventana y dentro del presupuesto, de la más nueva hacia atrás. */
function fullReadIds(
  messages: UIMessage[],
  rows: ReadonlyMap<string, WebReadForContext> | null,
  keep: number,
  budget: number,
): Set<string> {
  const full = new Set<string>();
  if (!rows) return full;
  const start = recentTurnsStart(messages, keep);
  let used = 0;
  for (let index = messages.length - 1; index >= start; index--) {
    for (const id of webReadIdsIn([messages[index]!])) {
      const row = rows.get(id);
      if (!row || full.has(id)) continue;
      const cost = costOf(row);
      // Una que no cabe no detiene la cuenta: una más vieja y más chica sí puede.
      if (used + cost <= budget) {
        full.add(id);
        used += cost;
      }
    }
  }
  return full;
}
