import type { UIMessage } from "ai";
import {
  READ_LINK_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  type ReadLinkOutput,
  type WebSearchOutput,
} from "@presencia/shared";
import type { WebReadRow } from "../web/web-reads.repository.js";
import { KEEP_ATTACHMENT_USER_TURNS, recentTurnsStart, safeName } from "./attachment-context.js";
import { trimResultFragments } from "./context-diet.js";

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
  const full = fullReadParts(messages, rows, keep, budget);
  return messages.map((message, messageIndex) => {
    if (!message.parts.some(isGoodRead)) return message;
    return {
      ...message,
      parts: message.parts.map((part, partIndex) => {
        if (!isGoodRead(part)) return part;
        const row = rows?.get(part.output.readId!);
        const contexto: PageView = !row
          ? { vista: "no_disponible" }
          : full.has(partKey(messageIndex, partIndex))
            ? fullView(row)
            : { vista: "linea", descripcion: row.description };
        return { ...part, output: { ...part.output, contexto } };
      }),
    };
  });
}

const partKey = (messageIndex: number, partIndex: number) =>
  `${String(messageIndex)}:${String(partIndex)}`;

/**
 * Las partes que van completas (su clave, con el id de su página): en la ventana y dentro del presupuesto, de la
 * más nueva hacia atrás. Por parte y no por página: releer una página (un
 * acierto del caché, el mismo id) la cita dos veces, y solo la lectura más
 * nueva lleva el texto; las demás van como línea. Por id, la página viajaba
 * completa una vez por cada lectura y el presupuesto la contaba una sola.
 */
function fullReadParts(
  messages: UIMessage[],
  rows: ReadonlyMap<string, WebReadForContext> | null,
  keep: number,
  budget: number,
): Map<string, string> {
  const full = new Map<string, string>();
  if (!rows) return full;
  const start = recentTurnsStart(messages, keep);
  const seen = new Set<string>();
  let used = 0;
  for (let index = messages.length - 1; index >= start; index--) {
    const parts = messages[index]!.parts;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex]!;
      if (!isGoodRead(part)) continue;
      const id = part.output.readId!;
      const row = rows.get(id);
      if (!row || seen.has(id)) continue;
      seen.add(id);
      const cost = costOf(row);
      // Una que no cabe no detiene la cuenta: una más vieja y más chica sí puede.
      if (used + cost <= budget) {
        full.set(partKey(index, partIndex), id);
        used += cost;
      }
    }
  }
  return full;
}

/**
 * Las páginas que se leyeron en un mensaje, como líneas de transcript (título
 * del chat, resumen de la compactación y memoria entre chats). Solo el
 * dominio: el título también lo escribió un tercero, y la memoria lo
 * resucitaría en otros chats (ADR-028: nada de una página entra a la memoria).
 * Lo que la página decía ya está en lo que el creator y Presencia hablaron.
 */
export function webReadLines(message: UIMessage): string[] {
  return message.parts.flatMap((part) => {
    if (isGoodRead(part)) {
      const { dominio, url } = part.output;
      return [`[Presencia leyó una página de ${dominio ?? safeName(url, 200)}]`];
    }
    // La consulta la escribió el modelo, no un tercero: sí entra.
    if (isDoneSearch(part)) {
      return [`[Presencia buscó en la web: "${safeName(part.output.consulta, 200)}"]`];
    }
    return [];
  });
}

const SEARCH_PART_TYPE = `tool-${WEB_SEARCH_TOOL_NAME}`;

/** Lo que queda de cada fragmento de una búsqueda de un turno anterior. */
export const SEARCH_SNIPPET_CHARS_AFTER_TURN = 200;

function isDoneSearch(
  part: UIMessage["parts"][number],
): part is UIMessage["parts"][number] & { state: "output-available"; output: WebSearchOutput } {
  if (part.type !== SEARCH_PART_TYPE) return false;
  const p = part as { state?: string; output?: WebSearchOutput };
  return p.state === "output-available" && p.output?.estado === "ok";
}

/**
 * Las búsquedas de turnos anteriores viajan cortas, como los recuerdos
 * (trimMemoryOutputsForModel): título, URL y el inicio de cada fragmento.
 * Lo que importaba ya está en la respuesta que el modelo escribió con ellas,
 * y si hace falta el detalle, abre la página con leer_enlace o vuelve a buscar.
 */
export function trimWebSearchOutputsForModel(messages: UIMessage[]): UIMessage[] {
  return trimResultFragments(messages, SEARCH_PART_TYPE, SEARCH_SNIPPET_CHARS_AFTER_TURN);
}

/**
 * Las lecturas que vale la pena describir ya: las que con un turno más dejarían
 * de viajar completas (o ya no viajan así). Una que sigue completa en la
 * ventana no necesita descripción todavía, y una que se queda completa hasta
 * que el chat se resume nunca la necesita: el resumen solo nombra su dominio.
 */
export function webReadIdsToDescribe(
  messages: UIMessage[],
  rows: ReadonlyMap<string, WebReadForContext> | null,
  keep = KEEP_ATTACHMENT_USER_TURNS,
  budget = RECENT_WEB_READ_TOKENS,
): string[] {
  if (!rows) return [];
  // Una página releída sigue completa si su lectura más nueva lo está.
  const stillFull = new Set(fullReadParts(messages, rows, keep - 1, budget).values());
  return webReadIdsIn(messages).filter((id) => rows.has(id) && !stillFull.has(id));
}
