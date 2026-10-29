import { tool, type ToolSet } from "ai";
import {
  READ_LINK_TOOL_NAME,
  WEB_READS_PER_TURN,
  readLinkInputSchema,
  type ReadLinkOutput,
  type WebReadStatus,
} from "@presencia/shared";
import { insideTag, safeName } from "../chat/attachment-context.js";
import { fullView, type PageView, type ReadLinkModelOutput } from "../chat/web-read-context.js";
import { normalizeReadUrl } from "./read-url.js";
import type { WebReadRow } from "./web-reads.repository.js";
import { failedOutput } from "./read-output.js";
import type { WebReadsService } from "./web-reads.service.js";

// F10.10 (ADR-028): la tool `leer_enlace`. Una por turno (el tope se cuenta
// aquí). Lo que devuelve `execute` es la referencia que se guarda en la parte
// del mensaje y ve la UI; lo que lee el modelo lo arma `toModelOutput`: el
// texto de la página delimitado, una línea, o el motivo por el que no se pudo
// leer.
//
// `toModelOutput` corre en este turno (después de execute) y en los
// siguientes (convertToModelMessages con estas tools). En este, la fila sale
// del mapa del turno; en los siguientes, la dieta de contexto
// (chat/web-read-context.ts) ya dejó en la parte lo que el modelo debe ver.

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

/** Una URL dentro de un atributo: se escapa, no se reescribe (el modelo la puede citar). */
function attrUrl(url: string): string {
  return url.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E").slice(0, 2048);
}

export function pageForModel(output: ReadLinkOutput, view: PageView | null): string {
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
  const where = `${output.dominio ?? output.urlFinal ?? output.url}${output.titulo ? ` ("${safeName(output.titulo)}")` : ""}`;
  if (!view || view.vista === "no_disponible") {
    return (
      `La lectura de ${where} ya no está disponible. Si el creator necesita algo de esa página, ` +
      "vuelve a leerla con leer_enlace."
    );
  }
  if (view.vista === "linea") {
    return (
      `[Página que leíste antes: ${where}${view.descripcion ? `. ${safeName(view.descripcion, 1000)}` : ""}. ` +
      "Ya no ves su texto: si necesitas el detalle, vuelve a leerla con leer_enlace (sale de lo " +
      "guardado, sin costo). No inventes lo que no ves.]"
    );
  }
  const attrs = [
    `url="${attrUrl(view.urlFinal)}"`,
    view.titulo ? `titulo="${safeName(view.titulo)}"` : null,
    view.sitio ? `sitio="${safeName(view.sitio)}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const notes = [
    view.recortada
      ? "[Solo leíste el inicio de la página: no inventes lo que diga después.]"
      : null,
    view.soloDescripcion
      ? "[La página no mostró su contenido: esto es solo su descripción. Dilo si el creator esperaba más.]"
      : null,
  ].filter(Boolean);
  return [`<pagina ${attrs}>`, insideTag(view.texto, "pagina"), "</pagina>", ...notes].join("\n");
}

export function buildReadLinkTool(deps: {
  userId: string;
  chatId: string;
  // Solo lo que la tool usa: la suite cultural le pasa uno de mentira tipado contra esto.
  service: Pick<WebReadsService, "read" | "findById">;
}): ToolSet {
  let reads = 0;
  // Las filas leídas en este turno, para no ir a la base en toModelOutput.
  const rows = new Map<string, WebReadRow>();
  // Dos llamadas a la misma página en un mismo paso (en paralelo, antes de
  // que la primera la guarde) comparten la lectura y gastan una sola del tope.
  const inFlight = new Map<string, Promise<ReadLinkOutput>>();

  return {
    [READ_LINK_TOOL_NAME]: tool({
      description:
        "Lee el texto de una página web pública: una nota, un blog, la página de un negocio o un PDF. " +
        "Úsala cuando el creator pegue un enlace y te pida usar, resumir o revisar lo que dice, o " +
        "cuando necesites el contenido de una página. No la uses para un enlace que solo va dentro " +
        "de la publicación (su tienda, su promo, su link de reservas). Devuelve el texto de la " +
        "página o el motivo por el que no se pudo leer.",
      inputSchema: readLinkInputSchema,
      execute: ({ url }, { abortSignal }): Promise<ReadLinkOutput> => {
        abortSignal?.throwIfAborted();
        const key = normalizeReadUrl(url) ?? url;
        const pending = inFlight.get(key);
        if (pending) return pending;
        if (reads >= WEB_READS_PER_TURN) return Promise.resolve(failedOutput(url, "limite"));
        reads += 1;
        const read = deps.service
          .read(deps.userId, deps.chatId, url, abortSignal)
          .then(({ output, row }) => {
            if (row) rows.set(row.id, row);
            return output;
          })
          // Solo mientras corre (lo leído ya queda en web_reads, que es el caché).
          .finally(() => inFlight.delete(key));
        inFlight.set(key, read);
        return read;
      },
      toModelOutput: async ({ output }) => {
        const out = output as ReadLinkModelOutput;
        let view: PageView | null = out.contexto ?? null;
        if (!view && out.estado === "ok" && out.readId) {
          const row =
            rows.get(out.readId) ?? (await deps.service.findById(deps.userId, out.readId));
          view = row ? fullView(row) : null;
        }
        return { type: "text", value: pageForModel(out, view) };
      },
    }),
  };
}
