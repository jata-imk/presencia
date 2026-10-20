import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { UIMessage } from "ai";
import {
  ATTACHMENT_MESSAGE_TOKEN_BUDGET,
  attachmentContentUrl,
  attachmentIdFromUrl,
  type AttachmentDto,
  type SentImageDto,
} from "@presencia/shared";
import { attachmentIdsIn, withAttachmentBytes } from "../chat/attachment-context.js";
import {
  ASSET_STORAGE,
  isMissingObject,
  type AssetDelivery,
  type AssetStorage,
} from "../assets/asset-storage.js";
import { DbService, type Tx } from "../db/db.service.js";
import { isForeignKeyViolation } from "../db/pg-error.js";
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

/**
 * Tope de la caché de bytes para el modelo (en caracteres de base64, ~1 byte
 * cada uno): ~64 MB del proceso de la API, unas 200 imágenes a 1568 px.
 */
const DATA_URL_CACHE_CHARS = 64 * 1024 * 1024;

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

  /** Ver modelDataUrl: id → `data:` de los últimos adjuntos que viajaron. */
  private readonly dataUrls = new Map<string, string>();
  private dataUrlChars = 0;

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
    const keys = { id, userId, storageKey, modelStorageKey };
    await this.storage.put(storageKey, processed.data, processed.mimeType);
    if (modelStorageKey && processed.modelData) {
      try {
        await this.storage.put(modelStorageKey, processed.modelData, processed.mimeType);
      } catch (error) {
        // La primera ya está arriba y todavía no tiene fila: nadie la borraría.
        await this.deleteObjects([{ ...keys, modelStorageKey: null }]);
        throw error;
      }
    }

    const row = await this.dbService
      .runWithTenant(userId, (tx) =>
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
      )
      .catch(async (error: unknown) => {
        // Sin fila, los bytes no los encontraría nadie (el barrido lee filas).
        await this.deleteObjects([keys]);
        // El chat se borró mientras subía (otra pestaña).
        if (isForeignKeyViolation(error, "message_attachments_chat_id_chats_id_fk")) {
          throw new NotFoundException("Ese chat no existe.");
        }
        throw error;
      });
    return toAttachmentDto(row);
  }

  /** Cómo entregarle el archivo al navegador, o `null` si no existe o no es suyo. */
  async deliver(
    userId: string,
    id: string,
    download = false,
  ): Promise<{ delivery: AssetDelivery; mimeType: string; filename: string } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, id));
    if (!row) return null;
    return {
      delivery: await this.storage.deliver(
        row.storageKey,
        row.mimeType,
        download ? row.filename : undefined,
      ),
      mimeType: row.mimeType,
      filename: row.filename,
    };
  }

  /**
   * F10.9: el texto de un adjunto, para verlo en el chat: el que se extrajo al
   * subirlo (UTF-8, sin BOM y con el tope de lo que leyó el modelo). Sale de
   * la base y no del bucket: mismo dominio (sin CORS contra R2), sin
   * adivinar codificaciones y sin bajar 25 MB para mostrar 100k caracteres.
   * `null` si no existe, no es suyo o no tiene texto (una imagen, un escaneo).
   */
  async readText(
    userId: string,
    id: string,
  ): Promise<{ text: string; truncated: boolean; filename: string } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, id));
    if (!row || row.extractedText === null) return null;
    return { text: row.extractedText, truncated: row.truncated, filename: row.filename };
  }

  /**
   * F10.9: los adjuntos de un mensaje que se envía, en la transacción del
   * envío. Cada uno tiene que ser suyo (RLS), de este chat o de ninguno
   * todavía, y de este mensaje o de ninguno (un reintento o una edición
   * vuelven a mandar los del mismo mensaje). Juntos no pueden pesar más que
   * ATTACHMENT_MESSAGE_TOKEN_BUDGET. Devuelve las partes con tipo y nombre de
   * la fila, no los que mandó el navegador, y los ids para ligarlos.
   */
  async resolveForMessage(
    tx: Tx,
    chatId: string,
    messageId: string | undefined,
    message: UIMessage,
  ): Promise<{ parts: UIMessage["parts"]; ids: string[] }> {
    const ids = attachmentIdsIn([message]);
    if (ids.length === 0) return { parts: message.parts, ids };

    const rows = new Map((await this.repo.findByIdsForSend(tx, ids)).map((row) => [row.id, row]));
    for (const id of ids) {
      const row = rows.get(id);
      const usable =
        row &&
        (row.chatId === null || row.chatId === chatId) &&
        (row.messageId === null || row.messageId === messageId);
      if (!usable) {
        throw new BadRequestException(
          "Uno de los archivos ya no está disponible. Quítalo y vuelve a adjuntarlo.",
        );
      }
    }
    const tokens = [...rows.values()].reduce((total, row) => total + row.tokenEstimate, 0);
    if (tokens > ATTACHMENT_MESSAGE_TOKEN_BUDGET) {
      throw new PayloadTooLargeException(
        "Los archivos de este mensaje son demasiado largos para leerlos juntos. Quita alguno o mándalos en mensajes separados.",
      );
    }

    const seen = new Set<string>();
    const parts = message.parts.flatMap((part): UIMessage["parts"] => {
      if (part.type !== "file") return [part];
      const row = rows.get(attachmentIdFromUrl(part.url)!)!;
      if (seen.has(row.id)) return [];
      seen.add(row.id);
      return [
        {
          type: "file",
          mediaType: row.mimeType,
          filename: row.filename,
          url: attachmentContentUrl(row.id),
        },
      ];
    });
    return { parts, ids };
  }

  /** El segundo paso del envío: ya con el id del mensaje guardado. */
  async linkToMessage(
    tx: Tx,
    ids: readonly string[],
    chatId: string,
    messageId: string,
  ): Promise<void> {
    // Con las filas bloqueadas desde resolveForMessage, ninguna puede haber
    // desaparecido; si pasara, el mensaje citaría un archivo que no existe.
    const linked = await this.repo.linkToMessage(tx, ids, chatId, messageId);
    if (linked !== ids.length) {
      throw new BadRequestException(
        "Uno de los archivos ya no está disponible. Quítalo y vuelve a adjuntarlo.",
      );
    }
  }

  /**
   * F10.9: las filas de los adjuntos que el contexto del modelo va a citar,
   * sin bytes. `null` si la lectura falla: el turno sigue, con los adjuntos
   * nombrados pero sin contenido (como las cards vivas, context-builder.ts).
   */
  async forContext(
    userId: string,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, AttachmentRow> | null> {
    if (ids.length === 0) return new Map();
    try {
      const rows = await this.dbService.runWithTenant(userId, (tx) => this.repo.findByIds(tx, ids));
      return new Map(rows.map((row) => [row.id, row]));
    } catch (error) {
      console.error("[adjuntos] No se pudieron leer los adjuntos del contexto:", error);
      return null;
    }
  }

  /**
   * F10.9: lo último antes de convertToModelMessages. Las partes `file` que
   * citan un adjunto pasan a llevar sus bytes (`data:`): la URL de la API es
   * relativa y con sesión, y el SDK no podría bajarla (con la cadena de
   * respaldo, `supportedUrls` vacío, la bajaría él). Corre DESPUÉS del techo
   * del contexto, para no leer lo que de todos modos no viaja. Un archivo que
   * no se pudo leer queda nombrado, sin contenido.
   */
  async materialize(
    messages: UIMessage[],
    rows: ReadonlyMap<string, AttachmentRow> | null,
  ): Promise<UIMessage[]> {
    const wanted = attachmentIdsIn(messages).flatMap((id) => {
      const row = rows?.get(id);
      return row ? [row] : [];
    });
    const loaded = new Map<string, string | null>();
    await Promise.all(
      wanted.map(async (row) => {
        try {
          loaded.set(row.id, await this.modelDataUrl(row));
        } catch (error) {
          console.error(`[adjuntos] No se pudo leer ${row.id} para el modelo:`, error);
          loaded.set(row.id, null);
        }
      }),
    );

    return withAttachmentBytes(messages, loaded);
  }

  /** Los bytes que ve el modelo (la variante chica de una imagen), sin caché. */
  readModelBytes(row: AttachmentRow): Promise<Uint8Array> {
    return this.storage.get(row.modelStorageKey ?? row.storageKey);
  }

  /**
   * Los bytes de un adjunto para el modelo, como `data:`. Con caché en
   * memoria: un adjunto reciente viaja en varios turnos seguidos, y sin ella
   * cada turno lo volvería a bajar del bucket (un PDF escaneado puede pesar
   * 25 MB). Los bytes de un adjunto nunca cambian, así que la caché no se
   * invalida: solo se acota por tamaño.
   */
  private async modelDataUrl(row: AttachmentRow): Promise<string> {
    const cached = this.dataUrls.get(row.id);
    if (cached) {
      // Al final: el más usado es el último en salir.
      this.dataUrls.delete(row.id);
      this.dataUrls.set(row.id, cached);
      return cached;
    }
    const bytes = await this.readModelBytes(row);
    const url = `data:${row.mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    // Dos turnos que fallan la caché a la vez guardan el mismo id dos veces:
    // el que se reemplaza deja de contar.
    const replaced = this.dataUrls.get(row.id);
    if (replaced) this.dataUrlChars -= replaced.length;
    this.dataUrls.set(row.id, url);
    this.dataUrlChars += url.length;
    for (const [id, old] of this.dataUrls) {
      if (this.dataUrlChars <= DATA_URL_CACHE_CHARS) break;
      this.dataUrls.delete(id);
      this.dataUrlChars -= old.length;
    }
    return url;
  }

  /** F10.9: las imágenes enviadas en un chat, para el selector de la card. */
  async sentImagesOfChat(userId: string, chatId: string): Promise<SentImageDto[]> {
    const rows = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.sentImagesOfChat(tx, chatId),
    );
    return rows.map(({ row, sentAt }) => ({
      ...toAttachmentDto(row),
      sentAt: sentAt.toISOString(),
    }));
  }

  /**
   * F10.9: los bytes de una imagen adjunta para copiarla a una card (la
   * versión guardada, ≤2048 px y sin EXIF). Tiene que ser una imagen enviada
   * en el mismo chat de la card. `null` si no lo es, no es suya o sus bytes
   * ya no están (el borrado del storage es best-effort, ver deleteObjects).
   */
  async imageForCard(
    userId: string,
    attachmentId: string,
    chatId: string,
  ): Promise<{ data: Uint8Array; filename: string } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findById(tx, attachmentId),
    );
    if (!row || row.kind !== "image" || row.chatId !== chatId || row.messageId === null)
      return null;
    try {
      return { data: await this.storage.get(row.storageKey), filename: row.filename };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
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
    const objects = keys.flatMap((k) =>
      k.modelStorageKey ? [k.storageKey, k.modelStorageKey] : [k.storageKey],
    );
    const results = await Promise.allSettled(objects.map((key) => this.storage.delete(key)));
    const reasons = results.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    if (reasons.length > 0) {
      console.error(
        `[adjuntos] No se pudieron borrar ${reasons.length} de ${objects.length} archivos:`,
        reasons,
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
