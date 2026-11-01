// Lo puro de volver a ver un adjunto (F10.11, ADR-029): qué parte del texto
// de un archivo ve el modelo cuando lo vuelve a ver, y cuánto le cuesta al
// turno. Aparte de la tool para probarlo sin base ni storage.
//
// - Una imagen o un PDF escaneado se ven completos: vuelven como archivo
//   (camino (a) de la sonda, docs/reference/releer-adjuntos/).
// - Un PDF con texto se puede pedir por páginas ("4", "3-5"): el texto ya
//   trae las marcas `[Página N]` (attachment-content.ts). Sin rango, desde el
//   inicio hasta el tope, por páginas enteras.
// - Un texto sin páginas (.csv, .txt, .md, .json): el inicio, hasta el tope.

import { normalizeAttachmentRef } from "@presencia/shared";
import { safeName } from "../chat/attachment-context.js";
import { IMAGE_TOKEN_ESTIMATE, PDF_PAGE_TOKEN_ESTIMATE } from "./attachment-content.js";

/** Lo más que se ve de un texto al volver a verlo: ~8k tokens a 3.5 caracteres por token. */
export const VIEW_TEXT_CHARS = 28_000;

/**
 * Lo que pueden sumar, en tokens estimados, los adjuntos que se vuelven a ver
 * en un mismo mensaje. Alcanza para un PDF escaneado al tope de 20 páginas
 * (~36k) o para varias fotos y textos; no para dos escaneados largos.
 */
export const VIEW_TURN_TOKENS = 40_000;

const CHARS_PER_TOKEN = 3.5;

/** Lo que la tool necesita de una fila de message_attachments. */
export interface ViewableAttachment {
  kind: "image" | "text" | "pdf";
  pages: number | null;
  scanned: boolean;
  extractedText: string | null;
  truncated: boolean;
  tokenEstimate: number;
}

export interface PageRange {
  from: number;
  to: number;
}

/**
 * "4" → 4 a 4; "3-5", "3–5" o "3 a 5" → 3 a 5. Un rango al revés se voltea y
 * uno que se pasa del final se recorta. `null` si no se entiende o queda fuera
 * del documento: la tool lo dice en vez de adivinar.
 */
export function parsePageRange(input: string, total: number): PageRange | null {
  const match = /^\s*(\d{1,4})\s*(?:(?:-|–|—|a|al)\s*(\d{1,4}))?\s*$/i.exec(input);
  if (!match) return null;
  let from = Number(match[1]);
  let to = match[2] ? Number(match[2]) : from;
  if (from > to) [from, to] = [to, from];
  if (from < 1 || from > total) return null;
  return { from, to: Math.min(to, total) };
}

/** Las páginas de un texto de PDF, en orden: `[Página N]` y lo que sigue. Las páginas sin texto no vienen. */
export function pdfPages(text: string): { page: number; text: string }[] {
  const pages: { page: number; text: string }[] = [];
  const marker = /\[Página (\d+)\]\n/g;
  const found = [...text.matchAll(marker)];
  found.forEach((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < found.length ? found[i + 1]!.index : text.length;
    pages.push({ page: Number(match[1]), text: text.slice(start, end).trim() });
  });
  return pages;
}

export interface TextView {
  text: string;
  /** Las páginas que se ven ("4", "1-5"); null si el texto no tiene páginas. */
  seen: string | null;
  /** Hay más que no se ve: pasó del tope, o el archivo se guardó recortado. */
  cut: boolean;
  /** La última página que se ve va cortada: ella sola pasa del tope. */
  sliced: boolean;
  /**
   * Por qué no hay nada que mostrar: la página no existe en el documento, no
   * tiene texto (es una imagen dentro de un PDF con texto) o no se guardó (el
   * texto se recortó en la subida antes de llegar a ella). null si hay algo.
   */
  missing: "no_existe" | "sin_texto" | "no_guardada" | null;
  /** Hasta qué página se guardó el texto de un PDF; null si no es un PDF. */
  lastStored: number | null;
}

/** "4" o "3-5": la forma en que la parte guarda las páginas. */
export const rangeLabel = (from: number, to: number) =>
  from === to ? String(from) : `${String(from)}-${String(to)}`;

/** Lo que se ve del texto de un adjunto al volver a verlo. */
export function textView(row: ViewableAttachment, pages?: string): TextView {
  const text = row.extractedText ?? "";
  if (row.kind === "pdf" && row.pages) {
    const all = pdfPages(text);
    const lastStored = all.at(-1)?.page ?? 0;
    const range = pages ? parsePageRange(pages, row.pages) : null;
    const empty = { text: "", seen: null, cut: false, sliced: false, lastStored };
    if (pages && !range) return { ...empty, missing: "no_existe" };
    const wanted = range ? all.filter((p) => p.page >= range.from && p.page <= range.to) : all;
    if (wanted.length === 0) {
      const notStored = row.truncated && (range?.from ?? 1) > lastStored;
      return { ...empty, missing: notStored ? "no_guardada" : "sin_texto" };
    }
    // Páginas enteras hasta el tope; si la primera sola ya pasa, va cortada.
    const kept: typeof wanted = [];
    let used = 0;
    let sliced = false;
    for (const page of wanted) {
      const block = `[Página ${String(page.page)}]\n${page.text}`;
      if (kept.length > 0 && used + block.length > VIEW_TEXT_CHARS) break;
      sliced = block.length > VIEW_TEXT_CHARS;
      kept.push({ page: page.page, text: block.slice(0, VIEW_TEXT_CHARS) });
      used += block.length + 2;
    }
    const first = kept[0]!.page;
    const last = kept.at(-1)!.page;
    return {
      text: kept.map((p) => p.text).join("\n\n"),
      seen: rangeLabel(first, last),
      // Quedaron páginas fuera por el tope, o se pidió más allá de lo guardado.
      cut:
        sliced ||
        kept.length < wanted.length ||
        (row.truncated && (range ? range.to : row.pages) > lastStored) ||
        // La última página guardada de un archivo recortado quedó a medias.
        (row.truncated && last >= lastStored),
      sliced,
      missing: null,
      lastStored,
    };
  }
  return {
    text: text.slice(0, VIEW_TEXT_CHARS),
    seen: null,
    cut: row.truncated || text.length > VIEW_TEXT_CHARS,
    sliced: false,
    missing: null,
    lastStored: null,
  };
}

/**
 * Si lo que escribió el modelo nombra este archivo. El modelo nunca ve el
 * nombre crudo: ve el que pasó por `safeName` (sin comillas ni `<>`, `[]`
 * como `()`, cualquier espacio raro como uno normal: una captura de macOS
 * trae un espacio angosto antes de "a.m."). Se comparan los dos así.
 */
export function sameAttachmentName(ref: string, filename: string): boolean {
  const shown = (name: string) => safeName(name).toLowerCase();
  return shown(normalizeAttachmentRef(ref)) === shown(filename);
}

/** Lo que le cuesta al turno volver a ver un adjunto, en tokens estimados. */
export function viewCost(row: ViewableAttachment, view: TextView | null): number {
  if (view) return Math.ceil(view.text.length / CHARS_PER_TOKEN);
  if (row.kind === "image") return IMAGE_TOKEN_ESTIMATE;
  return Math.max(row.pages ?? 1, 1) * PDF_PAGE_TOKEN_ESTIMATE;
}
