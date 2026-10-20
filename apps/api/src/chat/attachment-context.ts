import type { UIMessage } from "ai";
import { attachmentIdFromUrl, type AttachmentKind } from "@presencia/shared";
// Solo funciones: el ciclo history-window → history-compaction → aquí no
// toca nada al cargar el módulo.
import { isSyntheticMessage } from "./history-window.js";

// Lo que el modelo ve de los adjuntos (F10.9, ADR-006 addendum). Puro: recibe
// las filas ya leídas y decide qué viaja de cada uno.
//
// Un adjunto pesa: una imagen ~1,600 tokens, un archivo de texto hasta 30k, y
// todo el historial se reenvía en cada turno. Así que:
//
//  - **Recientes** (los mensajes de los últimos KEEP_ATTACHMENT_USER_TURNS
//    turnos del creator, mientras quepan en RECENT_ATTACHMENT_TOKENS sumando
//    del más nuevo al más viejo): completos. Los del mensaje de este turno, y
//    los de un turno que nunca terminó (se cortó, falló: "Continuar" lo
//    retoma), van completos siempre, fuera de esa cuenta. Así una foto
//    (~1,600 tokens) se queda sus tres turnos
//    —el ida y vuelta sobre la misma foto es el caso común— y un documento
//    grande (~30k) viaja completo solo en el turno en que se mandó (decisión
//    de Jose, F10.9: los turnos extra de un documento grande eran el único
//    costo que pesaba). El texto de un .md o de un PDF con texto
//    viaja como parte de texto, envuelto en <adjunto>; una imagen o un PDF
//    escaneado se queda como parte `file`, que `materialize` llena de bytes al
//    final.
//  - **Viejos**: una línea con su descripción (F10.9 PR4; mientras no la
//    haya, un extracto o solo el nombre). Es lo que hacen ChatGPT y Claude con
//    los archivos de una conversación larga, en versión barata: en vez de
//    recuperarlos por búsqueda, se resumen una vez y el resumen ocupa su lugar
//    (el patrón de LangChain "multi-vector retriever": describir una imagen o
//    una tabla una vez y usar la descripción como sustituto).
//
// La ventana se cuenta en turnos del creator, no en tokens: "lo de la foto que
// te mandé" casi siempre se refiere a algo de los últimos mensajes. F10.10 (lo
// que el chat lee de un enlace) usa la misma ventana (`recentTurnsStart`).

/** Cuántos turnos del creator, contando el actual, ven sus adjuntos completos. */
export const KEEP_ATTACHMENT_USER_TURNS = 3;

/**
 * Cuánto pesan, juntos, los adjuntos de turnos anteriores que siguen viajando
 * completos. Los del turno actual no cuentan aquí: van siempre (su tope es el
 * presupuesto por mensaje del envío, 60k).
 */
export const RECENT_ATTACHMENT_TOKENS = 12_000;

/** Lo que el contexto necesita de un adjunto (una fila de message_attachments). */
export interface AttachmentForContext {
  id: string;
  kind: AttachmentKind;
  filename: string;
  pages: number | null;
  scanned: boolean;
  extractedText: string | null;
  truncated: boolean;
  tokenEstimate: number;
  description: string | null;
}

/** Cuánto del extracto de un texto viejo sin descripción viaja. */
const EXCERPT_CHARS = 300;

/** Los ids de los adjuntos citados en unos mensajes, sin repetir. */
export function attachmentIdsIn(messages: UIMessage[]): string[] {
  const ids = messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      const id = part.type === "file" ? attachmentIdFromUrl(part.url) : null;
      return id ? [id] : [];
    }),
  );
  return [...new Set(ids)];
}

/**
 * El índice del primer mensaje de la ventana de recientes: el mensaje del
 * creator que abre el `keep`-ésimo turno contando desde el final. 0 si el
 * chat tiene menos turnos. Los mensajes que arma Presencia (el resumen, la
 * nota del techo) no son turnos del creator.
 */
export function recentTurnsStart(messages: UIMessage[], keep = KEEP_ATTACHMENT_USER_TURNS): number {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCreatorTurn(messages[i]!) && ++seen === keep) return i;
  }
  return 0;
}

function isCreatorTurn(message: UIMessage): boolean {
  return message.role === "user" && !isSyntheticMessage(message);
}

/**
 * Un turno del creator que no terminó: el último (el de ahora), o uno cuya
 * respuesta se cortó, falló o no llegó. Sus adjuntos siguen en juego: el
 * "Continúa" de después habla de ellos.
 */
function isOpenTurn(messages: UIMessage[], index: number): boolean {
  const next = messages[index + 1];
  if (!next) return true;
  if (next.role !== "assistant") return false;
  if (isSyntheticMessage(next)) return true;
  const status = (next.metadata as { status?: unknown } | undefined)?.status;
  return status === "stopped" || status === "failed";
}

/**
 * Los adjuntos de cada mensaje, como deben viajar al modelo. `attachments` es
 * `null` si la lectura falló: cada adjunto queda nombrado, sin contenido.
 */
export function dietAttachments(
  messages: UIMessage[],
  attachments: ReadonlyMap<string, AttachmentForContext> | null,
  keep = KEEP_ATTACHMENT_USER_TURNS,
  budget = RECENT_ATTACHMENT_TOKENS,
): UIMessage[] {
  const full = fullAttachmentIds(messages, attachments, keep, budget);
  return messages.map((message) => {
    if (!message.parts.some((part) => part.type === "file")) return message;
    return {
      ...message,
      parts: message.parts.flatMap((part): UIMessage["parts"] => {
        if (part.type !== "file") return [part];
        const id = attachmentIdFromUrl(part.url);
        if (!id) return [part];
        const row = attachments?.get(id);
        const name = safeName(row?.filename ?? part.filename ?? "archivo");
        if (!row) {
          return [
            {
              type: "text",
              text: `[Adjunto: "${name}" — no está disponible en este momento; si lo necesitas, pídele al creator que lo vuelva a adjuntar]`,
            },
          ];
        }
        return full.has(row.id)
          ? fullAttachment(part, row)
          : [{ type: "text", text: digestLine(row) }];
      }),
    };
  });
}

/**
 * Los adjuntos que viajan completos: los de un turno abierto (el de ahora, o
 * uno que se cortó), siempre y fuera del presupuesto; de ahí hacia atrás,
 * dentro de la ventana de turnos, los que quepan en `budget`. Uno que no cabe
 * no detiene la cuenta: uno más viejo y más chico (una foto detrás de un
 * documento grande) todavía puede entrar.
 */
function fullAttachmentIds(
  messages: UIMessage[],
  attachments: ReadonlyMap<string, AttachmentForContext> | null,
  keep: number,
  budget: number,
): Set<string> {
  const full = new Set<string>();
  if (!attachments) return full;
  const start = recentTurnsStart(messages, keep);
  let used = 0;
  for (let index = messages.length - 1; index >= start; index--) {
    const open = isCreatorTurn(messages[index]!) && isOpenTurn(messages, index);
    for (const id of attachmentIdsIn([messages[index]!])) {
      const row = attachments.get(id);
      if (!row || full.has(id)) continue;
      if (open) {
        // Van siempre y no gastan el presupuesto de los de antes: mandar un
        // documento grande no le quita su lugar a la foto del turno anterior.
        full.add(id);
      } else if (used + row.tokenEstimate <= budget) {
        full.add(id);
        used += row.tokenEstimate;
      }
    }
  }
  return full;
}

function fullAttachment(
  part: Extract<UIMessage["parts"][number], { type: "file" }>,
  row: AttachmentForContext,
): UIMessage["parts"] {
  if (row.extractedText !== null) {
    const what = row.kind === "pdf" ? `PDF de ${row.pages ?? "?"} páginas` : "archivo de texto";
    // La segunda frase sale de la suite cultural de F10.9: sin ella, algunos
    // modelos pedían "el archivo completo", que se volvería a cortar igual.
    const note = row.truncated
      ? "\n[Solo se leyó una parte: el archivo es más largo. Si te preguntan por algo que no está aquí, dilo. " +
        "Mandarlo completo otra vez se corta en el mismo lugar: pide solo la parte que falta, o el dato.]"
      : "";
    return [
      {
        type: "text",
        text: `<adjunto nombre="${safeName(row.filename)}" tipo="${what}">\n${insideTag(row.extractedText)}\n</adjunto>${note}`,
      },
    ];
  }
  const label =
    row.kind === "pdf"
      ? `[Adjunto: "${safeName(row.filename)}", PDF escaneado de ${row.pages ?? "?"} páginas, que ves como imágenes]`
      : `[Adjunto: imagen "${safeName(row.filename)}"]`;
  return [
    { type: "text", text: label },
    // El estimado viaja en la parte para el techo del contexto
    // (history-window.ts, estimateTokens); `materialize` arma una parte nueva
    // con los bytes y sin esto.
    { ...part, providerMetadata: { presencia: { tokens: row.tokenEstimate } } },
  ];
}

/** La línea de un adjunto que ya quedó atrás. */
export function digestLine(row: AttachmentForContext): string {
  const what = row.kind === "image" ? "imagen" : row.kind === "pdf" ? "PDF" : "archivo de texto";
  const about =
    (row.description && safeName(row.description, 1_000)) ??
    (row.extractedText
      ? `empieza así: "${safeName(row.extractedText.slice(0, EXCERPT_CHARS)).trim()}…"`
      : "ya no lo ves");
  return `[Adjunto de antes (${what} "${safeName(row.filename)}"): ${about}. Si necesitas el detalle, pídele al creator que lo vuelva a adjuntar.]`;
}

/**
 * Un nombre de archivo (o un extracto) dentro de una etiqueta o una línea: sin
 * comillas que la cierren, sin saltos ni `<>`. Lo escribe quien sube el
 * archivo, así que no puede salirse de su lugar.
 */
export function safeName(name: string, max = 300): string {
  return name
    .replace(/["<>]/g, "'")
    .replace(/[[\]]/g, (c) => (c === "[" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .slice(0, max);
}

/**
 * El contenido dentro de <adjunto>: un archivo de terceros que trae
 * "</adjunto>" no puede cerrar la etiqueta y seguir como si lo dijera el
 * creator (el prompt de sistema trata lo de adentro como datos).
 */
export function insideTag(text: string): string {
  return text.replace(/<(\/?)adjunto/gi, "‹$1adjunto");
}

/**
 * Los adjuntos de un mensaje como líneas de transcript (resumen, título,
 * memoria, "Pide un cambio"): quien lee la conversación como texto sabe que
 * hubo un archivo y cuál. Solo el nombre, sacado de la parte: estas funciones
 * son puras y no leen filas.
 */
export function attachmentLines(message: UIMessage): string[] {
  return message.parts.flatMap((part) => {
    const line = attachmentLine(part);
    return line ? [line] : [];
  });
}

/** La línea de una parte, o null si no es un adjunto. */
export function attachmentLine(part: UIMessage["parts"][number]): string | null {
  return part.type === "file" && attachmentIdFromUrl(part.url)
    ? `[El creator adjuntó "${safeName(part.filename ?? "un archivo")}"]`
    : null;
}

/**
 * Las partes `file` que citan un adjunto, con sus bytes: `loaded` va del id
 * al `data:` (o `null` si no se pudo leer). Un adjunto sin bytes queda
 * nombrado, sin contenido. Pura: la usan `AttachmentsService.materialize`
 * (con los bytes del storage) y la suite cultural (con los de memoria), así
 * las dos mandan lo mismo.
 */
export function withAttachmentBytes(
  messages: UIMessage[],
  loaded: ReadonlyMap<string, string | null>,
): UIMessage[] {
  return messages.map((message) => {
    if (!message.parts.some((part) => part.type === "file")) return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "file") return part;
        const id = attachmentIdFromUrl(part.url);
        if (!id) return part;
        const url = loaded.get(id);
        if (!url) {
          return {
            type: "text" as const,
            text: `[Adjunto: "${safeName(part.filename ?? "archivo")}" — no se pudo cargar; pídele al creator que lo vuelva a adjuntar si lo necesitas]`,
          };
        }
        return { type: "file" as const, mediaType: part.mediaType, filename: part.filename, url };
      }),
    };
  });
}
