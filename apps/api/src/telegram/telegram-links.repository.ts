import { Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { channelLinks } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Los vínculos de Telegram (F11, ADR-030) en `channel_links`: una fila por
// usuario y canal, que pasa por pendiente → activa → revocada.
//
// Dos clases de acceso, como el resto del repo (ADR-003):
// - con el tenant (`runWithTenant`): todo lo que el creator hace desde la web,
//   y toda escritura;
// - en modo barrido (`runWorkerScan`, policy `worker_scan` de 0059): lo que el
//   bot necesita sin saber de quién es el update. Solo lectura, solo filas
//   pendientes o activas.

export type ChannelLinkRow = typeof channelLinks.$inferSelect;

const TELEGRAM = "telegram" as const;

@Injectable()
export class TelegramLinksRepository {
  /** El vínculo de Telegram del usuario del tenant, en cualquier estado. */
  async findOwn(tx: Tx): Promise<ChannelLinkRow | undefined> {
    const [row] = await tx.select().from(channelLinks).where(eq(channelLinks.channel, TELEGRAM));
    return row;
  }

  /**
   * Deja el vínculo pendiente con un código nuevo (lo crea si no existe). Un
   * enlace anterior sin usar deja de servir: el hash se reemplaza. Lo que
   * hubiera de un vínculo revocado se limpia.
   */
  async upsertPending(
    tx: Tx,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<ChannelLinkRow> {
    const values = {
      status: "pending" as const,
      externalId: null,
      username: null,
      linkedAt: null,
      linkTokenHash: tokenHash,
      linkTokenExpiresAt: expiresAt,
    };
    const [row] = await tx
      .insert(channelLinks)
      .values({ userId, channel: TELEGRAM, ...values })
      .onConflictDoUpdate({ target: [channelLinks.userId, channelLinks.channel], set: values })
      .returning();
    if (!row) throw new Error("No se pudo guardar el vínculo de Telegram");
    return row;
  }

  /**
   * Canjea el código: activa SOLO si la fila sigue pendiente con ese mismo
   * hash (un código se usa una vez, aunque lleguen dos /start a la vez).
   * `undefined` si ya no estaba pendiente.
   */
  async activate(
    tx: Tx,
    linkId: string,
    tokenHash: string,
    externalId: string,
    username: string | null,
  ): Promise<ChannelLinkRow | undefined> {
    const [row] = await tx
      .update(channelLinks)
      .set({
        status: "active",
        externalId,
        username,
        linkedAt: sql`now()`,
        linkTokenHash: null,
        linkTokenExpiresAt: null,
      })
      .where(
        and(
          eq(channelLinks.id, linkId),
          eq(channelLinks.status, "pending"),
          eq(channelLinks.linkTokenHash, tokenHash),
        ),
      )
      .returning();
    return row;
  }

  /** Desconecta (o cancela un enlace pendiente). Devuelve la fila como quedó. */
  async revokeOwn(tx: Tx): Promise<ChannelLinkRow | undefined> {
    const [row] = await tx
      .update(channelLinks)
      .set({ status: "revoked", linkTokenHash: null, linkTokenExpiresAt: null })
      .where(
        and(
          eq(channelLinks.channel, TELEGRAM),
          inArray(channelLinks.status, ["pending", "active"]),
        ),
      )
      .returning();
    return row;
  }

  // --- Modo barrido (runWorkerScan): solo lectura ---

  /** La fila pendiente con ese código, de quien sea. */
  async findPendingByTokenHash(tx: Tx, tokenHash: string): Promise<ChannelLinkRow | undefined> {
    const [row] = await tx
      .select()
      .from(channelLinks)
      .where(
        and(
          eq(channelLinks.channel, TELEGRAM),
          eq(channelLinks.status, "pending"),
          eq(channelLinks.linkTokenHash, tokenHash),
        ),
      );
    return row;
  }

  /** El vínculo activo de esa cuenta de Telegram, de quien sea. */
  async findActiveByExternalId(tx: Tx, externalId: string): Promise<ChannelLinkRow | undefined> {
    const [row] = await tx
      .select()
      .from(channelLinks)
      .where(
        and(
          eq(channelLinks.channel, TELEGRAM),
          eq(channelLinks.status, "active"),
          eq(channelLinks.externalId, externalId),
        ),
      );
    return row;
  }
}
