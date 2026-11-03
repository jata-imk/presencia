import type { Api } from "grammy";
import type { Message } from "grammy/types";
import { attachmentKindFor, fileExtension } from "@presencia/shared";

// Los archivos que llegan por Telegram (F11 PR5, ADR-030): qué trae un mensaje
// y cómo se baja. Lo que entra va luego a AttachmentsService.upload, igual que
// un adjunto de la web (mismas validaciones, mismo storage, mismas partes).

/**
 * Lo que el Bot API deja bajar con `getFile`. El tope de un adjunto en la web
 * es 25 MB (ATTACHMENT_MAX_BYTES), pero por aquí manda el de Telegram.
 */
export const TELEGRAM_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;

const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Un archivo que se puede bajar y adjuntar. */
export interface TelegramFile {
  fileId: string;
  /** Lo que dice Telegram que pesa; puede faltar. */
  fileSize: number | undefined;
  filename: string;
  /** Una foto (comprimida por Telegram): en un álbum se numera. */
  photo: boolean;
}

/** Por qué un archivo no entra, sin bajarlo. `audio`: llega con las notas de voz (F11 PR6). */
export type TelegramRejection = "too_big" | "heic" | "unsupported" | "audio";

export type TelegramMedia =
  | { kind: "file"; file: TelegramFile }
  | {
      kind: "rejected";
      /** El nombre del archivo, o null si no tiene (un video del carrete). */
      filename: string | null;
      /** Qué es, para el aviso cuando no hay nombre ("un video"). */
      label: string;
      reason: TelegramRejection;
    };

const HEIC = /^image\/hei[cf]$/i;

/**
 * Qué archivo trae un mensaje, o null si no trae ninguno. Una foto llega en
 * varios tamaños: se toma el más grande (processAttachment la achica). Un
 * documento se revisa por nombre y tipo ANTES de bajarlo: no se bajan 19 MB
 * de un .docx para rechazarlo.
 */
export function mediaOf(message: Message): TelegramMedia | null {
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo.reduce((a, b) =>
      b.width * b.height > a.width * a.height ? b : a,
    );
    return sized({
      fileId: largest.file_id,
      fileSize: largest.file_size,
      filename: "foto.jpg",
      photo: true,
    });
  }
  const doc = message.document;
  if (doc) {
    const filename = doc.file_name?.trim() || "archivo";
    const type = doc.mime_type ?? "";
    const ext = fileExtension(filename);
    // Una foto del iPhone mandada "como archivo": como foto, Telegram la
    // convierte a JPEG; como archivo llega en HEIC, que no leemos.
    if (HEIC.test(type) || ext === ".heic" || ext === ".heif") {
      return { kind: "rejected", filename, label: "una foto", reason: "heic" };
    }
    if (!attachmentKindFor({ name: filename, type })) {
      return { kind: "rejected", filename, label: "un archivo", reason: "unsupported" };
    }
    return sized({ fileId: doc.file_id, fileSize: doc.file_size, filename, photo: false });
  }
  // Lo que un álbum puede traer además de fotos y documentos.
  if (message.video) {
    const filename = message.video.file_name?.trim() || null;
    return { kind: "rejected", filename, label: "un video", reason: "unsupported" };
  }
  if (message.audio) {
    const filename = message.audio.file_name?.trim() || null;
    return { kind: "rejected", filename, label: "un audio", reason: "audio" };
  }
  return null;
}

function sized(file: TelegramFile): TelegramMedia {
  return file.fileSize !== undefined && file.fileSize > TELEGRAM_DOWNLOAD_MAX_BYTES
    ? { kind: "rejected", filename: file.filename, label: "un archivo", reason: "too_big" }
    : { kind: "file", file };
}

/** El archivo pasa del tope que Telegram deja bajar. */
export class TelegramFileTooBigError extends Error {
  constructor() {
    super("El archivo pesa más de lo que Telegram deja bajar a un bot.");
    this.name = "TelegramFileTooBigError";
  }
}

/**
 * Baja un archivo del Bot API. La URL lleva el token del bot: nunca va a un
 * log ni a un mensaje de error (los errores se rearman con un texto propio).
 */
export async function downloadTelegramFile(
  api: Pick<Api, "getFile">,
  token: string,
  fileId: string,
  {
    maxBytes = TELEGRAM_DOWNLOAD_MAX_BYTES,
    fetchImpl = fetch,
  }: { maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<Uint8Array> {
  let file;
  try {
    file = await api.getFile(fileId);
  } catch (error) {
    if (error instanceof Error && /file is too big/i.test(error.message)) {
      throw new TelegramFileTooBigError();
    }
    throw error;
  }
  if (file.file_size !== undefined && file.file_size > maxBytes) {
    throw new TelegramFileTooBigError();
  }
  if (!file.file_path) throw new Error("Telegram no dio la ruta del archivo.");

  let response: Response;
  try {
    response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    // Sin el error original: su texto (o su `cause`) podría llevar la URL.
    const kind = error instanceof Error ? error.name : "Error";
    // eslint-disable-next-line preserve-caught-error -- el `cause` llevaría la URL con el token.
    throw new Error(`No se pudo bajar el archivo de Telegram (${kind}).`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`Telegram contestó ${String(response.status)} al bajar el archivo.`);
  }

  // Se lee con tope: `file_size` puede faltar, y no se confía en Content-Length.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new TelegramFileTooBigError();
    }
    chunks.push(value);
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
