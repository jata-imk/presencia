import { tool, type ToolSet } from "ai";
import {
  READ_LINK_TOOL_NAME,
  WEB_READS_PER_TURN,
  readLinkInputSchema,
  type ReadLinkOutput,
  type WebReadStatus,
} from "@presencia/shared";
import { safeName } from "../chat/attachment-context.js";
import type { WebReadRow } from "./web-reads.repository.js";
import type { WebReadsService } from "./web-reads.service.js";

// F10.10 (ADR-028): la tool `leer_enlace`. Una por turno (el tope se cuenta
// aquí). Lo que devuelve `execute` es la referencia que se guarda en la parte
// del mensaje y ve la UI; lo que lee el modelo lo arma `toModelOutput`: el
// texto de la página delimitado, o el motivo por el que no se pudo leer.
//
// `toModelOutput` corre en este turno (después de execute) y en los
// siguientes (convertToModelMessages con estas tools): en este, la fila sale
// del mapa del turno; en los siguientes, de la base.

/** Lo que ve el modelo de una página, como máximo (~6k tokens). Se guarda más. */
export const WEB_READ_MODEL_CHARS = 24_000;

const REASONS: Record<Exclude<WebReadStatus, "ok">, string> = {
  requiere_sesion: "esa red o página pide iniciar sesión (o pagar) para ver su contenido",
  no_encontrada: "la página no existe o la dirección está mal escrita",
  no_legible:
    "la página no tiene texto que se pueda leer sin un navegador (se arma con JavaScript), o es un PDF escaneado",
  bloqueada:
    "por seguridad no se abren direcciones internas, puertos fuera de lo normal ni enlaces con usuario y contraseña",
  tiempo: "la página no contestó a tiempo",
  muy_grande: "el archivo pesa demasiado para leerlo",
  tipo_no_soportado: "no es una página ni un PDF (es una imagen, un video u otro archivo)",
  no_disponible: "el sitio falló o no está disponible en este momento",
};

/** El texto de una página no puede cerrar su propia etiqueta. */
function insidePageTag(text: string): string {
  return text.replace(/<\/?pagina/gi, (m) => m.replace("<", "‹"));
}

export function pageForModel(output: ReadLinkOutput, row: WebReadRow | null): string {
  if (output.estado === "limite") {
    return (
      `No se leyó ${output.url}: ya leíste ${String(WEB_READS_PER_TURN)} páginas en este mensaje, ` +
      "el máximo. Trabaja con lo que ya leíste y, si hace falta esa página, dile al creator que " +
      "te la pida en otro mensaje o que pegue aquí su texto."
    );
  }
  if (output.estado !== "ok") {
    return (
      `No se pudo leer ${output.url}: ${REASONS[output.estado]}. Díselo al creator con naturalidad ` +
      "y pídele que pegue aquí el texto o te cuente qué dice. No inventes ni adivines su contenido."
    );
  }
  if (!row?.extractedText) {
    return (
      `La lectura de ${output.url} ya no está disponible. Si el creator necesita algo de esa ` +
      "página, vuelve a leerla con leer_enlace."
    );
  }
  const text =
    row.extractedText.length > WEB_READ_MODEL_CHARS
      ? `${row.extractedText.slice(0, WEB_READ_MODEL_CHARS)}…`
      : row.extractedText;
  const cut = row.truncated || row.extractedText.length > WEB_READ_MODEL_CHARS;
  const attrs = [
    `url="${safeName(row.finalUrl ?? row.url, 2048)}"`,
    row.title ? `titulo="${safeName(row.title)}"` : null,
    row.siteName ? `sitio="${safeName(row.siteName)}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const notes = [
    cut ? "[Solo leíste el inicio de la página: no inventes lo que diga después.]" : null,
    row.onlyDescription
      ? "[La página no mostró su contenido: esto es solo su descripción. Dilo si el creator esperaba más.]"
      : null,
  ].filter(Boolean);
  return [`<pagina ${attrs}>`, insidePageTag(text), "</pagina>", ...notes].join("\n");
}

export function buildReadLinkTool(deps: {
  userId: string;
  chatId: string;
  service: WebReadsService;
}): ToolSet {
  let reads = 0;
  // Las filas leídas en este turno, para no ir a la base en toModelOutput.
  const rows = new Map<string, WebReadRow>();

  return {
    [READ_LINK_TOOL_NAME]: tool({
      description:
        "Lee el texto de una página web pública: una nota, un blog, la página de un negocio o un PDF. " +
        "Úsala cuando el creator pegue un enlace y te pida usar, resumir o revisar lo que dice, o " +
        "cuando necesites el contenido de una página. No la uses para un enlace que solo va dentro " +
        "de la publicación (su tienda, su promo, su link de reservas). Devuelve el texto de la " +
        "página o el motivo por el que no se pudo leer.",
      inputSchema: readLinkInputSchema,
      execute: async ({ url }, { abortSignal }): Promise<ReadLinkOutput> => {
        abortSignal?.throwIfAborted();
        if (reads >= WEB_READS_PER_TURN) {
          return {
            readId: null,
            url,
            urlFinal: null,
            titulo: null,
            dominio: null,
            estado: "limite",
            truncado: false,
            soloDescripcion: false,
          };
        }
        reads += 1;
        const { output, row } = await deps.service.read(deps.userId, deps.chatId, url, abortSignal);
        if (row) rows.set(row.id, row);
        return output;
      },
      toModelOutput: async ({ output }) => {
        const out = output;
        const row =
          out.readId === null || out.estado !== "ok"
            ? null
            : (rows.get(out.readId) ?? (await deps.service.findById(deps.userId, out.readId)));
        return { type: "text", value: pageForModel(out, row) };
      },
    }),
  };
}
