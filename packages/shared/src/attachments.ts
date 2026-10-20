import { z } from "zod";

// F10.9: lo que el creator adjunta a un mensaje del chat (imágenes, texto,
// PDF). Constantes compartidas por la misma razón que assets.ts: el navegador
// avisa antes de subir y la API, que es la que manda, valida al recibir.
//
// Un adjunto NO es un asset: es de la conversación y muere con ella. Usar una
// imagen adjunta en una card la copia a `assets` (ADR-011, addendum F10.9).

/** 25 MB por archivo (presencia-chat.md, "Adjunto muy grande"). */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Cuántos archivos lleva un mensaje. */
export const ATTACHMENTS_PER_MESSAGE = 10;

/**
 * Cuánto texto se lee de un archivo (.md, .txt, .csv, .json o un PDF con
 * texto). Uno más largo se recorta, con aviso: rechazarlo dejaría fuera el
 * caso común (un menú largo, un export) por unas páginas de más.
 */
export const ATTACHMENT_TEXT_MAX_CHARS = 100_000;

/**
 * Páginas de un PDF escaneado (sin texto), que viaja al modelo como imágenes y
 * cuesta por página. Uno más largo se rechaza: "súbelo en partes".
 */
export const ATTACHMENT_SCANNED_PDF_MAX_PAGES = 20;

/**
 * Lo que pesan todos los adjuntos de un mensaje, en tokens estimados: la
 * mitad del techo del contexto (CHAT_HISTORY_CAP_TOKENS, 120k). El techo nunca
 * descarta el último mensaje, así que sin este tope un mensaje solo podría
 * llenarlo.
 */
export const ATTACHMENT_MESSAGE_TOKEN_BUDGET = 60_000;

/** Las imágenes que se aceptan. Un GIF se queda con su primer cuadro. */
export const ATTACHMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/**
 * Los archivos de texto se reconocen por la extensión: el navegador manda
 * cualquier cosa (o nada) como tipo de un .md o un .csv.
 */
export const ATTACHMENT_TEXT_EXTENSIONS = [".md", ".txt", ".csv", ".json"] as const;

export const ATTACHMENT_KINDS = ["image", "text", "pdf"] as const;
export const attachmentKindSchema = z.enum(ATTACHMENT_KINDS);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

/** Lo que devuelve la subida y lo que pinta el chip del composer. */
export interface AttachmentDto {
  id: string;
  kind: AttachmentKind;
  filename: string;
  /** El tipo real (por contenido), no el que dijo el navegador. */
  mediaType: string;
  sizeBytes: number;
  url: string;
  width: number | null;
  height: number | null;
  pages: number | null;
  /** PDF sin texto: viaja al modelo como imágenes, y cuesta más. */
  scanned: boolean;
  /** Se leyó solo una parte del texto (ATTACHMENT_TEXT_MAX_CHARS). */
  truncated: boolean;
  tokenEstimate: number;
  /** Cuándo se subió (ISO): el selector de la card lo muestra. */
  createdAt: string;
}

/** La URL que sirve un adjunto. Relativa: web y API comparten origen (ADR-020). */
export function attachmentContentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/content`;
}

const ATTACHMENT_URL = /^\/api\/attachments\/([0-9a-f-]{36})\/content$/i;

/**
 * El id de un adjunto a partir de la URL de una parte `file` del mensaje, o
 * null si no es la URL de un adjunto. El servidor no confía en nada más de la
 * parte: tipo y nombre los vuelve a leer de la fila.
 */
export function attachmentIdFromUrl(url: string): string | null {
  const match = ATTACHMENT_URL.exec(url);
  const id = match?.[1];
  return id && z.uuid().safeParse(id).success ? id.toLowerCase() : null;
}

/** La extensión en minúsculas, con punto (".md"), o "" si no tiene. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

/**
 * Qué tipo de adjunto parece un archivo, ANTES de subirlo (para avisar en el
 * acto). Null si no se acepta. La API decide de verdad por el contenido.
 */
export function attachmentKindFor(file: { name: string; type: string }): AttachmentKind | null {
  if ((ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return "image";
  if (file.type === "application/pdf" || fileExtension(file.name) === ".pdf") return "pdf";
  if ((ATTACHMENT_TEXT_EXTENSIONS as readonly string[]).includes(fileExtension(file.name))) {
    return "text";
  }
  return null;
}
