import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { processAttachment, RejectedAttachmentError } from "../attachments/attachment-content.js";
import type { FetchedKind } from "./safe-fetch.js";

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

/** Lo que se guarda de una página. Lo que ve el modelo es menos (el tope de contexto). */
export const WEB_READ_MAX_CHARS = 60_000;

/** Menos texto que esto en el cuerpo y no es un artículo: se prueba la descripción. */
const MIN_ARTICLE_CHARS = 200;
/** Ni la descripción llega a esto: no hay nada que leer. */
const MIN_READABLE_CHARS = 80;
/** Un <meta refresh> con más espera que esto no es un redirect: es una recarga. */
const MAX_REFRESH_DELAY_S = 1;

export type ExtractedPage =
  | {
      ok: true;
      title: string | null;
      siteName: string | null;
      text: string;
      /** Se guardó solo el inicio (WEB_READ_MAX_CHARS), o la descarga ya venía cortada. */
      truncated: boolean;
      /** Solo había la descripción de la página, no su cuerpo. */
      onlyDescription: boolean;
    }
  | { ok: false; detail: string };

export async function extractPage(input: {
  kind: FetchedKind;
  body: Uint8Array;
  charset: string | null;
  url: string;
  truncated: boolean;
}): Promise<ExtractedPage> {
  if (input.kind === "pdf") return extractPdf(input.body);
  const raw = decode(
    input.body,
    input.charset ?? (input.kind === "html" ? sniffCharset(input.body) : null),
  );
  if (input.kind === "text") return capped(null, null, normalize(raw), input.truncated, false);
  return extractHtml(raw, input.url, input.truncated);
}

function extractHtml(html: string, url: string, downloadTruncated: boolean): ExtractedPage {
  const { document } = parseHTML(html);
  const doc = document;
  // Readability resuelve los links relativos contra la URL del documento.
  try {
    const base = doc.createElement("base");
    base.setAttribute("href", url);
    doc.head?.prepend(base);
  } catch {
    // Sin <head> no hay a qué colgarla; los links relativos no importan para el texto.
  }
  // Antes de Readability, que modifica el documento.
  const fallbackTitle = doc.querySelector("title")?.textContent?.trim() || null;
  const fallbackDescription = metaDescription(doc);
  const article = new Readability(doc, { serializer: textWithBreaks }).parse();
  const title = clean(article?.title) ?? fallbackTitle;
  const siteName = clean(article?.siteName);
  const text = normalize(article?.content ?? "");
  if (text.length >= MIN_ARTICLE_CHARS)
    return capped(title, siteName, text, downloadTruncated, false);

  const description = normalize(article?.excerpt ?? fallbackDescription ?? "");
  const best = description.length > text.length ? description : text;
  if (best.length < MIN_READABLE_CHARS) {
    return { ok: false, detail: "la página no tiene texto legible sin JavaScript" };
  }
  return capped(title, siteName, best, downloadTruncated, best === description);
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

function capped(
  title: string | null,
  siteName: string | null,
  text: string,
  truncated: boolean,
  onlyDescription: boolean,
): ExtractedPage {
  if (text.length <= WEB_READ_MAX_CHARS) {
    return { ok: true, title, siteName, text, truncated, onlyDescription };
  }
  return {
    ok: true,
    title,
    siteName,
    text: `${text.slice(0, WEB_READ_MAX_CHARS)}…`,
    truncated: true,
    onlyDescription,
  };
}

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

/**
 * El texto del artículo con sus párrafos. `textContent` los pega todos en una
 * línea, y el modelo (y la descripción) leen mejor con saltos.
 */
function textWithBreaks(node: Node): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push(n.nodeValue ?? "");
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n as Element).tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push("\n\n");
    if (tag === "LI") parts.push("- ");
    n.childNodes.forEach(walk);
    if (block) parts.push("\n\n");
  };
  walk(node);
  return parts.join("");
}

/** Espacios colapsados por línea, sin más de una línea en blanco seguida. */
function normalize(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      // `\s` incluye el espacio duro (&nbsp;); dentro de una línea ya no hay saltos.
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function clean(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v : null;
}

function metaDescription(doc: Document): string | null {
  const content = (name: string) =>
    doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content");
  return content("og:description") ?? content("description") ?? null;
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
