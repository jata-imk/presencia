import type { AttachmentDto } from "@presencia/shared";

// Subir un archivo como cuerpo crudo, con su nombre en X-File-Name: así viajan
// los adjuntos del chat (F10.9), "Subir propia" de la card (lib/cards-api.ts)
// y lo que se sube a Biblioteca (F12). Con XMLHttpRequest y no con fetch:
// fetch no reporta el progreso de lo que SUBE, y tanto el chip del composer
// como el panel de Biblioteca lo muestran.

export class UploadError extends Error {
  constructor(
    message: string,
    /** Falló la red o el servidor: el mismo archivo puede subir al reintentar. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export interface Upload<T = AttachmentDto> {
  promise: Promise<T>;
  abort: () => void;
}

/** Sube `file` a `url` y resuelve con el JSON que devuelve la API. */
export function uploadRaw<T>(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Upload<T> {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Un 200 que no es JSON (un proxy que devolvió la página de la app):
        // sin esto el chip se quedaría en "Subiendo… 100%" para siempre.
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new UploadError("No se pudo subir", true));
        }
        return;
      }
      // Los rechazos de la API traen su motivo en español (413, 415, 422).
      let message: string | undefined;
      try {
        message = (JSON.parse(xhr.responseText) as { message?: unknown }).message as
          string | undefined;
      } catch {
        message = undefined;
      }
      const retryable = xhr.status >= 500 || xhr.status === 0;
      reject(
        new UploadError(
          !retryable && typeof message === "string" ? message : "No se pudo subir",
          retryable,
        ),
      );
    };
    xhr.onerror = () => reject(new UploadError("No se pudo subir", true));
    xhr.onabort = () => reject(new UploadError("Subida cancelada", false));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

/** La subida de un adjunto del chat (F10.9). */
export function uploadAttachment(
  file: File,
  options: { chatId: string | null; onProgress: (percent: number) => void },
): Upload {
  const url = options.chatId
    ? `/api/attachments?chatId=${encodeURIComponent(options.chatId)}`
    : "/api/attachments";
  return uploadRaw<AttachmentDto>(url, file, options.onProgress);
}
