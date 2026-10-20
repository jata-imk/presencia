import {
  ATTACHMENT_MESSAGE_TOKEN_BUDGET,
  ATTACHMENTS_PER_MESSAGE,
  attachmentKindFor,
} from "@presencia/shared";
import { showToast } from "../../stores/toast-store.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uuid } from "../uuid.js";
import { filePartsOf, preflightError, room, type PendingAttachment } from "./attachments.js";
import { uploadAttachment, UploadError } from "./upload.js";

// Los adjuntos del composer (F10.9). Se suben al adjuntar, no al enviar: el
// envío sale inmediato y el chip muestra el progreso. Botón, pegar y soltar
// terminan aquí, en `add`.
//
// `chatId` es null en la pantalla de chat nuevo: el chat todavía no existe y
// el adjunto se le liga al enviar.

export interface AttachmentsController {
  items: PendingAttachment[];
  add: (files: File[]) => void;
  remove: (key: string) => void;
  retry: (key: string) => void;
  /** Vacía el composer (después de enviar): ya no cancela ni borra nada del servidor. */
  clear: () => void;
}

export function useAttachments(chatId: string | null): AttachmentsController {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  // Fuera del estado: el File para reintentar y el abort de la subida en curso.
  const files = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, () => void>());
  const count = useRef(0);
  count.current = items.length;

  const patch = useCallback((key: string, changes: Partial<PendingAttachment>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const start = useCallback(
    (key: string, file: File) => {
      const upload = uploadAttachment(file, {
        chatId,
        onProgress: (progress) => patch(key, { progress }),
      });
      aborts.current.set(key, upload.abort);
      upload.promise
        .then((dto) => {
          // Ya no hace falta para reintentar: se suelta (diez de 25 MB pesan).
          files.current.delete(key);
          patch(key, { status: "ready", progress: 100, dto, error: null });
        })
        .catch((error: unknown) => {
          // Quitado mientras subía: el chip ya no existe.
          if (!aborts.current.has(key)) return;
          const failed =
            error instanceof UploadError ? error : new UploadError("No se pudo subir", true);
          patch(key, { status: "error", error: failed.message, retryable: failed.retryable });
        })
        .finally(() => aborts.current.delete(key));
    },
    [chatId, patch],
  );

  const add = useCallback(
    (incoming: File[]) => {
      // Lo que no cabe en el mensaje no entra, y se dice: con el botón o al
      // pegar no hay overlay que lo advierta antes.
      const accepted = incoming.slice(0, room(count.current));
      const left = incoming.length - accepted.length;
      if (left > 0) {
        showToast({
          title: `Puedes adjuntar hasta ${String(ATTACHMENTS_PER_MESSAGE)} archivos por mensaje`,
          description:
            left === 1
              ? "Uno no se agregó: mándalo en el siguiente mensaje."
              : `${String(left)} no se agregaron: mándalos en el siguiente mensaje.`,
        });
      }
      if (accepted.length === 0) return;
      const fresh = accepted.map((file): PendingAttachment => {
        const key = uuid();
        const error = preflightError(file);
        const kind = attachmentKindFor(file);
        if (!error) files.current.set(key, file);
        return {
          key,
          name: file.name,
          size: file.size,
          kind,
          previewUrl: kind === "image" && !error ? URL.createObjectURL(file) : null,
          status: error ? "error" : "uploading",
          progress: 0,
          dto: null,
          error,
          retryable: false,
        };
      });
      count.current += fresh.length;
      setItems((list) => [...list, ...fresh]);
      for (const item of fresh) {
        const file = files.current.get(item.key);
        if (file) start(item.key, file);
      }
    },
    [start],
  );

  const remove = useCallback((key: string) => {
    const abort = aborts.current.get(key);
    aborts.current.delete(key);
    abort?.();
    files.current.delete(key);
    setItems((list) => {
      const gone = list.find((item) => item.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return list.filter((item) => item.key !== key);
    });
  }, []);

  const retry = useCallback(
    (key: string) => {
      const file = files.current.get(key);
      if (!file) return;
      patch(key, { status: "uploading", progress: 0, error: null, retryable: false });
      start(key, file);
    },
    [patch, start],
  );

  const clear = useCallback(() => {
    // Lo que ya se envió no se cancela: sus subidas terminaron. Las miniaturas
    // locales sí se sueltan (el mensaje enviado usa la URL de la API).
    aborts.current.clear();
    files.current.clear();
    setItems((list) => {
      for (const item of list) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);

  // Al salir de la pantalla: subidas en curso canceladas y miniaturas sueltas.
  const latest = useRef(items);
  latest.current = items;
  useEffect(
    () => () => {
      for (const abort of aborts.current.values()) abort();
      for (const item of latest.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  return useMemo(() => ({ items, add, remove, retry, clear }), [items, add, remove, retry, clear]);
}

/** Lo que el composer necesita saber para dejar enviar. */
export function attachmentsState(items: readonly PendingAttachment[]) {
  const tokens = items.reduce((total, item) => total + (item.dto?.tokenEstimate ?? 0), 0);
  return {
    parts: filePartsOf(items),
    uploading: items.some((item) => item.status === "uploading"),
    blocked: items.some((item) => item.status === "error"),
    // La misma cuenta que hace la API al enviar (413): aquí se ve antes de
    // mandar. Después, reintentar o editar reenvían los mismos archivos y
    // no habría cómo quitar uno.
    tooHeavy: tokens > ATTACHMENT_MESSAGE_TOKEN_BUDGET,
  };
}
