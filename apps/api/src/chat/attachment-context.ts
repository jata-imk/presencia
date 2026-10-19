import type { UIMessage } from "ai";
import { attachmentIdFromUrl, type AttachmentKind } from "@presencia/shared";

// Lo que el modelo ve de los adjuntos (F10.9, ADR-006 addendum). Puro: recibe
// las filas ya leídas y decide qué viaja de cada uno.
//
// Un adjunto pesa: una imagen ~1,600 tokens, un archivo de texto hasta 30k, y
// todo el historial se reenvía en cada turno. Así que:
//
//  - **Recientes** (los mensajes de los últimos KEEP_ATTACHMENT_USER_TURNS
//    turnos del creator): completos. El texto de un .md o de un PDF con texto
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
 * chat tiene menos turnos.
 */
export function recentTurnsStart(messages: UIMessage[], keep = KEEP_ATTACHMENT_USER_TURNS): number {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user" && ++seen === keep) return i;
  }
  return 0;
}

/**
 * Los adjuntos de cada mensaje, como deben viajar al modelo. `attachments` es
 * `null` si la lectura falló: cada adjunto queda nombrado, sin contenido.
 */
export function dietAttachments(
  messages: UIMessage[],
  attachments: ReadonlyMap<string, AttachmentForContext> | null,
  keep = KEEP_ATTACHMENT_USER_TURNS,
): UIMessage[] {
  const start = recentTurnsStart(messages, keep);
  return messages.map((message, index) => {
    if (!message.parts.some((part) => part.type === "file")) return message;
    const recent = index >= start;
    return {
      ...message,
      parts: message.parts.flatMap((part): UIMessage["parts"] => {
        if (part.type !== "file") return [part];
        const id = attachmentIdFromUrl(part.url);
        if (!id) return [part];
        const row = attachments?.get(id);
        const name = row?.filename ?? part.filename ?? "archivo";
        if (!row) {
          return [
            {
              type: "text",
              text: `[Adjunto: "${name}" — no está disponible en este momento; si lo necesitas, pídele al creator que lo vuelva a adjuntar]`,
            },
          ];
        }
        return recent ? fullAttachment(part, row) : [{ type: "text", text: digestLine(row) }];
      }),
    };
  });
}

function fullAttachment(
  part: Extract<UIMessage["parts"][number], { type: "file" }>,
  row: AttachmentForContext,
): UIMessage["parts"] {
  if (row.extractedText !== null) {
    const what = row.kind === "pdf" ? `PDF de ${row.pages ?? "?"} páginas` : "archivo de texto";
    const note = row.truncated
      ? "\n[Solo se leyó una parte: el archivo es más largo. Si te preguntan por algo que no está aquí, dilo.]"
      : "";
    return [
      {
        type: "text",
        text: `<adjunto nombre="${quoted(row.filename)}" tipo="${what}">\n${row.extractedText}\n</adjunto>${note}`,
      },
    ];
  }
  const label =
    row.kind === "pdf"
      ? `[Adjunto: "${row.filename}", PDF escaneado de ${row.pages ?? "?"} páginas, que ves como imágenes]`
      : `[Adjunto: imagen "${row.filename}"]`;
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
    row.description ??
    (row.extractedText
      ? `empieza así: "${row.extractedText.slice(0, EXCERPT_CHARS).replace(/\s+/g, " ").trim()}…"`
      : "ya no lo ves");
  return `[Adjunto de antes (${what} "${row.filename}"): ${about}. Si necesitas el detalle, pídele al creator que lo vuelva a adjuntar.]`;
}

function quoted(text: string): string {
  return text.replace(/"/g, "'");
}

/**
 * Los adjuntos de un mensaje como líneas de transcript (resumen, título,
 * memoria, "Pide un cambio"): quien lee la conversación como texto sabe que
 * hubo un archivo y cuál. Solo el nombre, sacado de la parte: estas funciones
 * son puras y no leen filas.
 */
export function attachmentLines(message: UIMessage): string[] {
  return message.parts.flatMap((part) =>
    part.type === "file" && attachmentIdFromUrl(part.url)
      ? [`[El creator adjuntó "${part.filename ?? "un archivo"}"]`]
      : [],
  );
}
