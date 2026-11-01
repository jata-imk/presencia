// `ver_adjunto` de la suite (F10.11): la tool de producción
// (attachments/view-attachment.tool.ts) con un servicio de mentira que
// busca entre los adjuntos de la conversación del caso, como hace
// web-pages.ts con `leer_enlace`. Lo que se mide es la tool real: su
// descripción, su schema, su tope y lo que arma su `toModelOutput`.

import type { ToolSet } from "ai";
import type { AttachmentForContext } from "../../src/chat/attachment-context.js";
import type { AttachmentRow } from "../../src/attachments/attachments.repository.js";
import type { AttachmentsService } from "../../src/attachments/attachments.service.js";
import { normalizeAttachmentRef } from "../../src/attachments/attachment-view.js";
import { buildViewAttachmentTool } from "../../src/attachments/view-attachment.tool.js";

/** Un adjunto de la conversación, con lo que la tool necesita para volver a verlo. */
export interface ViewableFile {
  row: AttachmentForContext;
  mimeType: string;
  dataUrl: string;
}

/** La fila completa que espera la tool, a partir de lo que ya armó la suite. */
function rowOf(file: ViewableFile): AttachmentRow {
  return {
    ...file.row,
    userId: "suite",
    chatId: "suite",
    messageId: "suite",
    mimeType: file.mimeType,
    sizeBytes: 0,
    storageKey: "suite",
    modelStorageKey: null,
    width: null,
    height: null,
    describedAt: null,
    createdAt: new Date(),
  };
}

/** La tool, nueva por corrida: lleva su tope por turno. */
export function suiteViewAttachmentTools(files: readonly ViewableFile[]): ToolSet {
  const service: Pick<AttachmentsService, "findForView" | "modelData"> = {
    findForView: (_userId, _chatId, ref) => {
      const wanted = normalizeAttachmentRef(ref).toLowerCase();
      // Por id, o el más nuevo con ese nombre (los últimos van al final).
      const found =
        files.find((f) => f.row.id === wanted) ??
        [...files].reverse().find((f) => f.row.filename.toLowerCase() === wanted);
      return Promise.resolve(found ? rowOf(found) : null);
    },
    modelData: (row) => {
      const file = files.find((f) => f.row.id === row.id);
      if (!file) return Promise.reject(new Error(`La suite no tiene los bytes de ${row.id}`));
      return Promise.resolve(file.dataUrl.slice(file.dataUrl.indexOf(",") + 1));
    },
  };
  return buildViewAttachmentTool({ userId: "suite", chatId: "suite", service });
}
