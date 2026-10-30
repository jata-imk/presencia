import { processAttachment, RejectedAttachmentError } from "../attachments/attachment-content.js";
import { capped, normalize, type ExtractedPage } from "./extract-text.js";
import { extractHtmlOffThread } from "./extract-html-thread.js";
import type { FetchedKind } from "./safe-fetch.js";

export { WEB_READ_MAX_CHARS, type ExtractedPage } from "./extract-text.js";

// F10.10 (ADR-028): de los bytes de una página al texto que lee el modelo.
//
// HTML: Readability (el modo lectura de Firefox) sobre linkedom, un DOM sin
// navegador. Saca el cuerpo principal y deja fuera menús, anuncios y pies.
// Título y sitio salen de lo mismo que lee Readability (`og:`, JSON-LD,
// `<title>`). Si no queda texto (una página armada con JavaScript), se usa la
// descripción `og:`; si tampoco hay, la página es `no_legible` y el modelo lo
// dice en vez de adivinar.
//
// PDF: el mismo camino que un PDF adjunto (attachment-content.ts). Uno
// escaneado no tiene texto: `no_legible`.

/** Un <meta refresh> con más espera que esto no es un redirect: es una recarga. */
const MAX_REFRESH_DELAY_S = 1;

export async function extractPage(
  input: {
    kind: FetchedKind;
    body: Uint8Array;
    charset: string | null;
    url: string;
    truncated: boolean;
  },
  signal?: AbortSignal,
): Promise<ExtractedPage> {
  if (input.kind === "pdf") return extractPdf(input.body);
  const raw = decode(
    input.body,
    input.charset ?? (input.kind === "html" ? sniffCharset(input.body) : null),
  );
  if (input.kind === "text") return capped(null, null, normalize(raw), input.truncated, false);
  return extractHtmlOffThread(raw, input.url, input.truncated, { signal });
}

async function extractPdf(body: Uint8Array): Promise<ExtractedPage> {
  // El Content-Type miente a veces (una página de error servida como PDF): sin
  // la firma, ni se intenta. processAttachment probaría si es una imagen.
  if (Buffer.from(body.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    return { ok: false, detail: "dice ser PDF y no lo es" };
  }
  try {
    const processed = await processAttachment(body, "pagina.pdf");
    if (!processed.extractedText || processed.scanned) {
      return { ok: false, detail: "es un PDF escaneado, sin texto" };
    }
    return capped(null, null, normalize(processed.extractedText), processed.truncated, false);
  } catch (error) {
    if (error instanceof RejectedAttachmentError) return { ok: false, detail: error.message };
    throw error;
  }
}

/**
 * El destino de un `<meta http-equiv="refresh" content="0; url=…">`: hay
 * sitios que redirigen así en vez de con un 3xx ("Redirigiendo a…"). Solo los
 * primeros bytes, como un navegador; null si no hay.
 */
export function metaRefreshTarget(body: Uint8Array, baseUrl: string): string | null {
  const head = Buffer.from(body.subarray(0, 8192))
    .toString("latin1")
    // Un navegador con JavaScript no ve lo que va en <noscript>.
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const tag = /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i.exec(head)?.[0];
  const content = tag && /content\s*=\s*["']?\s*(\d+)\s*[;,]([^>]*)/i.exec(tag);
  if (!content) return null;
  // Solo el redirect inmediato. Un "recarga en 5 minutos" de una nota (que a
  // veces lleva a la portada) no es a dónde apunta el link.
  if (Number(content[1]) > MAX_REFRESH_DELAY_S) return null;
  const target = /url\s*=\s*['"]?([^'">\s]+)/i.exec(content[2] ?? "")?.[1];
  if (!target) return null;
  try {
    return new URL(target, baseUrl).href;
  } catch {
    return null;
  }
}

/** El charset de un `<meta>` en los primeros bytes, como hace un navegador. */
function sniffCharset(body: Uint8Array): string | null {
  const head = Buffer.from(body.subarray(0, 4096)).toString("latin1");
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ?? null;
}

/** Muchos sitios mexicanos viejos siguen en ISO-8859-1: sin esto, "Mérida" sale "MÃ©rida" o "M�rida". */
function decode(body: Uint8Array, charset: string | null): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(body);
    } catch {
      // Una etiqueta que TextDecoder no conoce: se cae a UTF-8.
    }
  }
  return new TextDecoder("utf-8").decode(body);
}
