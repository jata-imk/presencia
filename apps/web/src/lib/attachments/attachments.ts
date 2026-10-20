import {
  ATTACHMENTS_PER_MESSAGE,
  ATTACHMENT_MAX_BYTES,
  attachmentKindFor,
  type AttachmentDto,
  type AttachmentKind,
} from "@presencia/shared";
import type { FileUIPart } from "ai";

// Lo puro de los adjuntos del composer (F10.9): qué se acepta antes de subir,
// cómo se nombra lo que se pega y cómo se muestra. La API vuelve a validar al
// recibir (por contenido, no por extensión): esto solo avisa en el acto.

/** Un adjunto en el composer, de que se elige hasta que se envía. */
export interface PendingAttachment {
  key: string;
  name: string;
  size: number;
  /** null: un tipo que no se adjunta (su chip ya nace con error). */
  kind: AttachmentKind | null;
  /** Miniatura local de una imagen (object URL), mientras sube y después. */
  previewUrl: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  dto: AttachmentDto | null;
  error: string | null;
  /** El error fue de la red o del servidor: "Reintentar" puede funcionar. */
  retryable: boolean;
}

export const TYPE_NOT_ACCEPTED = "Este tipo de archivo no se puede adjuntar";

/** El mensaje de error de un archivo antes de subirlo, o null si pasa. */
export function preflightError(file: { name: string; type: string; size: number }): string | null {
  if (!attachmentKindFor(file)) return TYPE_NOT_ACCEPTED;
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `Muy grande: el límite es ${formatSize(ATTACHMENT_MAX_BYTES)}`;
  }
  return null;
}

/** Cuántos de `incoming` caben todavía en el mensaje. */
export function room(current: number): number {
  return Math.max(ATTACHMENTS_PER_MESSAGE - current, 0);
}

/**
 * El nombre de lo que se pega: Chrome y Safari llaman "image.png" a toda
 * captura pegada, así que diez capturas serían diez "image.png". Se renombra
 * con la fecha: `captura-20261018-1042.png`.
 */
export function pastedName(file: File, now = new Date()): string {
  const generic = !file.name || /^image\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if (!generic) return file.name;
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `captura-${stamp}.${ext}`;
}

/** "2.4 MB", "342 KB": con un decimal, como el diseño del chip. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}

/** Un nombre largo cortado a la mitad, para que se vea la extensión: "guia-de-vo…-2026.md". */
export function middleEllipsis(name: string, max: number): string {
  if (name.length <= max) return name;
  const tail = name.slice(-Math.min(10, Math.floor(max / 2)));
  return `${name.slice(0, Math.max(max - tail.length - 1, 1))}…${tail}`;
}

/** El aviso que no bloquea el envío, o null. */
export function attachmentWarning(dto: AttachmentDto | null): string | null {
  if (!dto) return null;
  if (dto.scanned) return "Este PDF es escaneado: leerlo consume más de tu cuota";
  if (dto.truncated) return "Archivo largo: solo se leyó una parte";
  return null;
}

/** La etiqueta corta del tipo (MD, CSV, PDF…), para el ícono de un archivo. */
export function extensionLabel(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? name
        .slice(dot + 1)
        .toUpperCase()
        .slice(0, 4)
    : "ARCH";
}

/** Las partes `file` que viajan en el mensaje: solo las que ya subieron. */
export function filePartsOf(items: readonly PendingAttachment[]): FileUIPart[] {
  return items.flatMap((item) =>
    item.status === "ready" && item.dto
      ? [
          {
            type: "file" as const,
            mediaType: item.dto.mediaType,
            filename: item.dto.filename,
            url: item.dto.url,
          },
        ]
      : [],
  );
}
