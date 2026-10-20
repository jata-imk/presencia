import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { chats, messageAttachments, messages } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `message_attachments` vive aquí (F10.9). Sin filtro por
// user_id: el RLS de la transacción es el filtro (ADR-003).

export type AttachmentRow = typeof messageAttachments.$inferSelect;
export type InsertAttachmentInput = typeof messageAttachments.$inferInsert;

/** Lo mínimo para borrar un adjunto: de quién es y dónde están sus bytes. */
export interface AttachmentKeys {
  id: string;
  userId: string;
  storageKey: string;
  modelStorageKey: string | null;
}

const KEYS = {
  id: messageAttachments.id,
  userId: messageAttachments.userId,
  storageKey: messageAttachments.storageKey,
  modelStorageKey: messageAttachments.modelStorageKey,
};

@Injectable()
export class AttachmentsRepository {
  async insert(tx: Tx, input: InsertAttachmentInput): Promise<AttachmentRow> {
    const [row] = await tx.insert(messageAttachments).values(input).returning();
    if (!row) throw new Error("No se pudo registrar el adjunto");
    return row;
  }

  /** Si el chat existe y es suyo (RLS). Sin pasar por ChatModule: él depende de este. */
  async chatExists(tx: Tx, chatId: string): Promise<boolean> {
    const [row] = await tx.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId));
    return row !== undefined;
  }

  async findById(tx: Tx, id: string): Promise<AttachmentRow | undefined> {
    const [row] = await tx.select().from(messageAttachments).where(eq(messageAttachments.id, id));
    return row;
  }

  /** Varios por id, en la transacción del llamador (RLS: los ajenos no vienen). */
  findByIds(tx: Tx, ids: readonly string[]): Promise<AttachmentRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx.select().from(messageAttachments).where(inArray(messageAttachments.id, ids));
  }

  /**
   * F10.9: los de un envío, con sus filas bloqueadas hasta el final de la
   * transacción: otro envío del mismo adjunto (otra pestaña, otro chat) o el
   * barrido esperan a que este termine, y para entonces ven que ya tiene
   * mensaje.
   */
  findByIdsForSend(tx: Tx, ids: readonly string[]): Promise<AttachmentRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx
      .select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.id, ids))
      .for("update");
  }

  /** F10.9: los liga al mensaje (y al chat, si se subieron sin él) al enviar. Cuántos ligó. */
  async linkToMessage(
    tx: Tx,
    ids: readonly string[],
    chatId: string,
    messageId: string,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const linked = await tx
      .update(messageAttachments)
      .set({ chatId, messageId })
      .where(inArray(messageAttachments.id, ids))
      .returning({ id: messageAttachments.id });
    return linked.length;
  }

  /**
   * F10.9: guarda la descripción si todavía no la tiene. Devuelve si la
   * escribió: un job repetido no la pisa ni la vuelve a cobrar.
   */
  async setDescription(tx: Tx, id: string, description: string): Promise<boolean> {
    const updated = await tx
      .update(messageAttachments)
      .set({ description, describedAt: new Date() })
      .where(and(eq(messageAttachments.id, id), isNull(messageAttachments.description)))
      .returning({ id: messageAttachments.id });
    return updated.length > 0;
  }

  /**
   * F10.9: las imágenes que el creator ya envió en un chat, de la más nueva a
   * la más vieja por la hora de su mensaje (el selector "Usar una que
   * adjuntaste" de la card). Solo las enviadas: una que está en el composer
   * todavía no es parte del chat.
   */
  sentImagesOfChat(tx: Tx, chatId: string): Promise<{ row: AttachmentRow; sentAt: Date }[]> {
    return tx
      .select({ row: messageAttachments, sentAt: messages.createdAt })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(
        and(
          eq(messageAttachments.chatId, chatId),
          eq(messageAttachments.kind, "image"),
          isNotNull(messageAttachments.messageId),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messageAttachments.createdAt));
  }

  /** Las llaves de los adjuntos de un chat: para borrar sus bytes al borrar el chat. */
  keysByChat(tx: Tx, chatId: string): Promise<AttachmentKeys[]> {
    return tx.select(KEYS).from(messageAttachments).where(eq(messageAttachments.chatId, chatId));
  }

  /**
   * Barrido (sin tenant, `runWorkerScan`): los que nunca se enviaron, o que
   * quedaron fuera de un mensaje editado, desde antes de `before`. La policy
   * `worker_scan` solo deja ver esos.
   */
  findUnsentBefore(tx: Tx, before: Date, limit: number): Promise<AttachmentKeys[]> {
    return tx
      .select(KEYS)
      .from(messageAttachments)
      .where(and(isNull(messageAttachments.messageId), lt(messageAttachments.createdAt, before)))
      .orderBy(messageAttachments.createdAt)
      .limit(limit);
  }

  /**
   * Borra los que SIGUEN sin enviar (uno se pudo enviar entre el barrido y
   * esto) y devuelve los que borró: solo esos bytes se tocan.
   */
  deleteUnsent(tx: Tx, ids: readonly string[]): Promise<AttachmentKeys[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx
      .delete(messageAttachments)
      .where(and(inArray(messageAttachments.id, ids), isNull(messageAttachments.messageId)))
      .returning(KEYS);
  }
}
