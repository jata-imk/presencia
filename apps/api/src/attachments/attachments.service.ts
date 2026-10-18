import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { attachmentContentUrl, type AttachmentDto } from "@presencia/shared";
import { ASSET_STORAGE, type AssetDelivery, type AssetStorage } from "../assets/asset-storage.js";
import { DbService, type Tx } from "../db/db.service.js";
import {
  RejectedAttachmentError,
  UnsupportedAttachmentError,
  cleanFilename,
  processAttachment,
} from "./attachment-content.js";
import {
  AttachmentsRepository,
  type AttachmentKeys,
  type AttachmentRow,
} from "./attachments.repository.js";

/** Cuánto vive un adjunto que nunca se envió (presencia-chat.md, F10.9). */
export const UNSENT_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
/** Cuántos borra el barrido por pasada: el siguiente tick sigue con el resto. */
const CLEANUP_BATCH = 200;

// Los adjuntos del chat (F10.9, ADR-011 addendum). Se suben al adjuntar, no al
// enviar: el chip muestra el progreso y el envío sale inmediato. Se guardan en
// el mismo storage que Biblioteca, en su propia carpeta del usuario
// (`userId/adjuntos/`), con el mismo guardado de dos pasos que los assets:
// bytes primero, fila después.
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AttachmentsRepository) private readonly repo: AttachmentsRepository,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
  ) {}

  /**
   * Sube un archivo. `chatId` es null en la pantalla de chat nuevo: el chat
   * todavía no existe, y el adjunto se le liga al enviar.
   */
  async upload(input: {
    userId: string;
    chatId: string | null;
    data: Uint8Array;
    filename: string | undefined;
  }): Promise<AttachmentDto> {
    const { userId, chatId, data } = input;
    if (chatId) {
      const exists = await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.chatExists(tx, chatId),
      );
      if (!exists) throw new NotFoundException("Ese chat no existe.");
    }

    let processed;
    try {
      processed = await processAttachment(data, input.filename ?? "");
    } catch (error) {
      if (error instanceof UnsupportedAttachmentError) {
        throw new UnsupportedMediaTypeException(
          "Este tipo de archivo no se puede adjuntar. Prueba con una imagen, un PDF o un archivo .md, .txt, .csv o .json.",
        );
      }
      if (error instanceof RejectedAttachmentError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    const id = randomUUID();
    const storageKey = `${userId}/adjuntos/${id}.${processed.extension}`;
    const modelStorageKey = processed.modelData
      ? `${userId}/adjuntos/${id}-modelo.${processed.extension}`
      : null;
    await this.storage.put(storageKey, processed.data, processed.mimeType);
    if (modelStorageKey && processed.modelData) {
      await this.storage.put(modelStorageKey, processed.modelData, processed.mimeType);
    }

    const row = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.insert(tx, {
        id,
        userId,
        chatId,
        kind: processed.kind,
        filename: cleanFilename(input.filename, `archivo.${processed.extension}`),
        mimeType: processed.mimeType,
        sizeBytes: processed.data.byteLength,
        storageKey,
        modelStorageKey,
        width: processed.width,
        height: processed.height,
        pages: processed.pages,
        scanned: processed.scanned,
        extractedText: processed.extractedText,
        truncated: processed.truncated,
        tokenEstimate: processed.tokenEstimate,
      }),
    );
    return toAttachmentDto(row);
  }

  /** Cómo entregarle el archivo al navegador, o `null` si no existe o no es suyo. */
  async deliver(
    userId: string,
    id: string,
  ): Promise<{ delivery: AssetDelivery; mimeType: string; filename: string } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, id));
    if (!row) return null;
    return {
      delivery: await this.storage.deliver(row.storageKey, row.mimeType),
      mimeType: row.mimeType,
      filename: row.filename,
    };
  }

  /** Las llaves de un chat, en la transacción de quien lo borra. */
  keysByChat(tx: Tx, chatId: string): Promise<AttachmentKeys[]> {
    return this.repo.keysByChat(tx, chatId);
  }

  /**
   * Borra los bytes de adjuntos cuyas filas ya no existen. Nunca lanza: lo
   * llaman después de un commit. Un archivo que no se pudo borrar queda como
   * bytes sin fila, invisibles (la misma basura barata de ADR-011).
   */
  async deleteObjects(keys: readonly AttachmentKeys[]): Promise<void> {
    const objects = keys.flatMap((k) => (k.modelStorageKey ? [k.storageKey, k.modelStorageKey] : [k.storageKey]));
    const results = await Promise.allSettled(objects.map((key) => this.storage.delete(key)));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(
        `[adjuntos] No se pudieron borrar ${failed.length} de ${objects.length} archivos:`,
        failed.map((r) => (r as PromiseRejectedResult).reason),
      );
    }
  }

  /**
   * El cron `attachments.cleanup`: borra los adjuntos que llevan más de un
   * día sin mensaje (nunca se enviaron, o quedaron fuera de un mensaje
   * editado). Devuelve cuántos borró.
   */
  async cleanupUnsent(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - UNSENT_ATTACHMENT_TTL_MS);
    const found = await this.dbService.runWorkerScan((tx) =>
      this.repo.findUnsentBefore(tx, before, CLEANUP_BATCH),
    );
    const byUser = new Map<string, string[]>();
    for (const row of found) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);

    let deleted = 0;
    for (const [userId, ids] of byUser) {
      const gone = await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.deleteUnsent(tx, ids),
      );
      await this.deleteObjects(gone);
      deleted += gone.length;
    }
    return deleted;
  }
}

export function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mediaType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: attachmentContentUrl(row.id),
    width: row.width,
    height: row.height,
    pages: row.pages,
    scanned: row.scanned,
    truncated: row.truncated,
    tokenEstimate: row.tokenEstimate,
  };
}
