import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

// F10.10 (ADR-028): el HTML de una página al texto que lee el modelo. Aparte
// de extract.ts porque corre en un worker (extract-html-thread.ts): con mucho
// markup, linkedom + Readability tardan segundos, y en el hilo principal eso
// congelaba los streams de todos los chats. Solo lo que el worker necesita,
// sin el lector de PDF ni sharp.

/** Lo que se guarda de una página. Lo que ve el modelo es menos (el tope de contexto). */
export const WEB_READ_MAX_CHARS = 60_000;

/** Menos texto que esto en el cuerpo y no es un artículo: se prueba la descripción. */
const MIN_ARTICLE_CHARS = 200;
/** Ni la descripción llega a esto: no hay nada que leer. */
const MIN_READABLE_CHARS = 80;
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

export function extractHtml(html: string, url: string, downloadTruncated: boolean): ExtractedPage {
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

export function capped(
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
export function normalize(text: string): string {
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
