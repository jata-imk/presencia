import {
  ATTACHMENT_SCANNED_PDF_MAX_PAGES,
  ATTACHMENT_TEXT_EXTENSIONS,
  ATTACHMENT_TEXT_MAX_CHARS,
  fileExtension,
  type AttachmentKind,
} from "@presencia/shared";
import { extractText } from "unpdf";
import { InvalidImageError } from "../assets/image-inspect.js";
import { normalizeImage } from "../assets/image-normalize.js";

// F10.9: qué es un archivo adjunto y qué se guarda de él. Lo que diga el
// navegador (Content-Type) no decide nada: se mira el contenido.
//
//  - **Imagen** (sharp la lee): se guarda sin EXIF y a ≤2048 px, más una
//    variante de ≤1568 px para el modelo.
//  - **PDF** (`%PDF-`): se extrae su texto (unpdf, el pdf.js sin worker). Si casi
//    no tiene texto, es escaneado: viaja nativo al modelo, que lo lee como
//    imágenes, y por eso tiene tope de páginas.
//  - **Texto** (.md, .txt, .csv, .json): UTF-8 válido, sin bytes nulos.
//
// Las estimaciones de tokens alimentan el presupuesto por mensaje y el techo
// del contexto. Salen de los docs de cada proveedor, redondeadas hacia arriba
// para el más caro de la cadena:
//  - imagen a 1568 px: ~1,600 (Anthropic: ancho × alto / 750);
//  - página de PDF nativo: ~1,800 (Anthropic cobra texto + imagen por página,
//    1.5k–3k; OpenAI y Gemini, menos);
//  - texto: un token cada ~3.5 caracteres en español (más que los ~4 del inglés).

/** Lado máximo de lo que se guarda: alcanza para publicar en cualquier red. */
export const STORED_IMAGE_MAX_EDGE = 2048;
/** Lado máximo de lo que ve el modelo. */
export const MODEL_IMAGE_MAX_EDGE = 1568;

export const IMAGE_TOKEN_ESTIMATE = 1_600;
export const PDF_PAGE_TOKEN_ESTIMATE = 1_800;
const CHARS_PER_TOKEN = 3.5;

/**
 * Menos caracteres que esto por página, en promedio, es un PDF escaneado: lo
 * que trae es el número de página, un pie, una marca de agua.
 */
const SCANNED_CHARS_PER_PAGE = 50;

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
};

export interface ProcessedAttachment {
  kind: AttachmentKind;
  mimeType: string;
  /** Extensión de la llave en el storage, sin punto. */
  extension: string;
  /** Lo que se guarda. */
  data: Uint8Array;
  /** Solo imágenes más grandes que MODEL_IMAGE_MAX_EDGE: la variante del modelo. */
  modelData: Uint8Array | null;
  width: number | null;
  height: number | null;
  pages: number | null;
  scanned: boolean;
  extractedText: string | null;
  truncated: boolean;
  tokenEstimate: number;
}

/** Un archivo de un tipo que no se adjunta (415). */
export class UnsupportedAttachmentError extends Error {}

/** Un archivo del tipo correcto que no se puede usar (422), con el motivo para el creator. */
export class RejectedAttachmentError extends Error {}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export async function processAttachment(
  data: Uint8Array,
  filename: string,
): Promise<ProcessedAttachment> {
  if (isPdf(data)) return processPdf(data);
  try {
    return await processImage(data);
  } catch (error) {
    if (!(error instanceof InvalidImageError)) throw error;
  }
  if ((ATTACHMENT_TEXT_EXTENSIONS as readonly string[]).includes(fileExtension(filename))) {
    return processText(data, fileExtension(filename));
  }
  throw new UnsupportedAttachmentError(`Tipo no admitido: ${filename}`);
}

function isPdf(data: Uint8Array): boolean {
  return Buffer.from(data.subarray(0, 5)).toString("latin1") === "%PDF-";
}

async function processImage(data: Uint8Array): Promise<ProcessedAttachment> {
  const stored = await normalizeImage(data, { maxEdge: STORED_IMAGE_MAX_EDGE });
  const needsModelCopy = Math.max(stored.width, stored.height) > MODEL_IMAGE_MAX_EDGE;
  const model = needsModelCopy
    ? await normalizeImage(stored.data, { maxEdge: MODEL_IMAGE_MAX_EDGE })
    : null;
  return {
    kind: "image",
    mimeType: stored.mimeType,
    extension: stored.mimeType === "image/jpeg" ? "jpg" : stored.mimeType.slice("image/".length),
    data: stored.data,
    modelData: model?.data ?? null,
    width: stored.width,
    height: stored.height,
    pages: null,
    scanned: false,
    extractedText: null,
    truncated: false,
    tokenEstimate: IMAGE_TOKEN_ESTIMATE,
  };
}

async function processPdf(data: Uint8Array): Promise<ProcessedAttachment> {
  let pages: number;
  let text: string[];
  try {
    // Una copia: pdf.js se queda con el buffer que recibe (lo transfiere), y
    // los bytes originales todavía se guardan después.
    ({ totalPages: pages, text } = await extractText(new Uint8Array(data), { mergePages: false }));
  } catch (error) {
    throw new RejectedAttachmentError(
      "No pudimos leer este PDF. Puede estar dañado o protegido con contraseña.",
      { cause: error },
    );
  }
  const visible = text.reduce((total, page) => total + page.replace(/\s/g, "").length, 0);
  const scanned = pages === 0 || visible / pages < SCANNED_CHARS_PER_PAGE;
  const base = {
    kind: "pdf" as const,
    mimeType: "application/pdf",
    extension: "pdf",
    data,
    modelData: null,
    width: null,
    height: null,
    pages,
  };

  if (scanned) {
    if (pages > ATTACHMENT_SCANNED_PDF_MAX_PAGES) {
      throw new RejectedAttachmentError(
        `Este PDF escaneado tiene ${pages} páginas; el límite es ${ATTACHMENT_SCANNED_PDF_MAX_PAGES}. Súbelo en partes.`,
      );
    }
    return {
      ...base,
      scanned: true,
      extractedText: null,
      truncated: false,
      tokenEstimate: Math.max(pages, 1) * PDF_PAGE_TOKEN_ESTIMATE,
    };
  }

  // Con la página marcada: el creator dice "lo de la página 3", y el modelo
  // tiene que poder ubicarlo.
  const full = text
    .map((page, i) => `[Página ${i + 1}]\n${page.trim()}`)
    .filter((page) => page.length > 0)
    .join("\n\n");
  const { text: kept, truncated } = capText(full);
  return {
    ...base,
    scanned: false,
    extractedText: kept,
    truncated,
    tokenEstimate: estimateTextTokens(kept),
  };
}

function processText(data: Uint8Array, extension: string): ProcessedAttachment {
  let decoded: string;
  try {
    // `fatal`: un archivo que no es UTF-8 (un .txt de Windows en Latin-1, un
    // binario renombrado) se rechaza en vez de llegar con "�" en cada acento.
    // El BOM se quita solo (ignoreBOM es false por default).
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (error) {
    throw new RejectedAttachmentError(
      "Este archivo no está en UTF-8. Guárdalo como texto UTF-8 e inténtalo de nuevo.",
      { cause: error },
    );
  }
  if (decoded.includes("\u0000")) {
    throw new UnsupportedAttachmentError("El archivo no es de texto");
  }
  const { text, truncated } = capText(decoded);
  return {
    kind: "text",
    mimeType: TEXT_MIME_BY_EXTENSION[extension] ?? "text/plain",
    extension: extension.slice(1),
    data,
    modelData: null,
    width: null,
    height: null,
    pages: null,
    scanned: false,
    extractedText: text,
    truncated,
    tokenEstimate: estimateTextTokens(text),
  };
}

function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= ATTACHMENT_TEXT_MAX_CHARS) return { text, truncated: false };
  let cut = text.slice(0, ATTACHMENT_TEXT_MAX_CHARS);
  // Sin dejar media pareja de surrogates (un emoji partido) al final.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return { text: cut, truncated: true };
}

/**
 * El nombre que se guarda y se muestra: sin carpetas (algunos navegadores las
 * mandan), sin caracteres de control y con un tope. Una captura pegada llega
 * sin nombre: la web le pone uno.
 */
export function cleanFilename(raw: string | undefined, fallback: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || fallback).slice(0, 200);
}
