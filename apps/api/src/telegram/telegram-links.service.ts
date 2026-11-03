import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  TELEGRAM_LINK_TTL_MINUTES,
  type TelegramLinkDto,
  type TelegramLinkStatusDto,
} from "@presencia/shared";
import { DbService } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-error.js";
import { hashLinkToken, newLinkToken } from "./link-token.js";
import { TelegramLinksRepository, type ChannelLinkRow } from "./telegram-links.repository.js";

// Vincular una cuenta de Telegram con la de Presencia (F11, ADR-030).
//
// El creator genera un enlace en Configuración: `t.me/<bot>?start=<código>`.
// Al abrirlo, Telegram le muestra "Iniciar", y el bot recibe `/start <código>`
// del usuario de Telegram que lo abrió. Ese es el único momento en que se
// sabe que esta cuenta de Telegram es de esta cuenta de Presencia.
//
// El código (link-token.ts) vive 15 minutos y se usa una vez.

/** Cómo terminó un `/start <código>`, para que el bot conteste lo que toca. */
export type RedeemResult = { kind: "linked" | "already_linked" | "invalid" | "expired" | "taken" };

@Injectable()
export class TelegramLinksService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(TelegramLinksRepository) private readonly repo: TelegramLinksRepository,
  ) {}

  /** Genera el enlace de un solo uso. 409 si ya hay un Telegram conectado. */
  async createLink(
    userId: string,
    botUsername: string,
    now = new Date(),
  ): Promise<TelegramLinkDto> {
    const token = newLinkToken();
    const expiresAt = new Date(now.getTime() + TELEGRAM_LINK_TTL_MINUTES * 60_000);
    const row = await this.db.runWithTenant(userId, (tx) =>
      this.repo.upsertPending(tx, userId, hashLinkToken(token), expiresAt),
    );
    if (!row) {
      throw new ConflictException(
        "Tu cuenta ya tiene un Telegram conectado. Desconéctalo antes de conectar otro.",
      );
    }
    return {
      url: `https://t.me/${botUsername}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async status(userId: string, now = new Date()): Promise<TelegramLinkStatusDto> {
    const row = await this.db.runWithTenant(userId, (tx) => this.repo.findOwn(tx));
    return toStatus(row, now);
  }

  /** Desconecta desde la web. Devuelve el id de Telegram que estaba activo, si había. */
  async unlink(userId: string): Promise<string | null> {
    const before = await this.db.runWithTenant(userId, async (tx) => {
      const current = await this.repo.findOwn(tx);
      await this.repo.revokeOwn(tx);
      return current;
    });
    return before?.status === "active" ? before.externalId : null;
  }

  /**
   * `/start <código>` desde el Telegram `externalId`. No lanza por un código
   * malo: el bot contesta según el resultado.
   */
  async redeem(
    token: string,
    externalId: string,
    username: string | null,
    now = new Date(),
  ): Promise<RedeemResult> {
    const tokenHash = hashLinkToken(token);
    // Sin tenant: todavía no se sabe de quién es el código (policy worker_scan).
    const { pending, active } = await this.db.runWorkerScan(async (tx) => ({
      pending: await this.repo.findPendingByTokenHash(tx, tokenHash),
      active: await this.repo.findActiveByExternalId(tx, externalId),
    }));
    if (!pending) {
      // Reabrir el enlace que este mismo Telegram ya canjeó no es un error
      // (la fila activa conserva el hash). Cualquier otro código —de otra
      // cuenta, reemplazado o inventado— ya no sirve, aunque este Telegram
      // esté conectado a alguna cuenta: decirle "ya conectado" haría creer al
      // dueño de ese código que se conectó.
      return { kind: active?.linkTokenHash === tokenHash ? "already_linked" : "invalid" };
    }
    if (!pending.linkTokenExpiresAt || pending.linkTokenExpiresAt <= now)
      return { kind: "expired" };
    // Una cuenta tiene una sola fila de Telegram: si este Telegram está activo,
    // es en otra cuenta (la de `pending` sigue pendiente).
    if (active) return { kind: "taken" };

    try {
      const linked = await this.db.runWithTenant(pending.userId, (tx) =>
        this.repo.activate(tx, pending.id, tokenHash, externalId, username),
      );
      // Otro /start con el mismo código ganó la carrera, o venció justo ahora.
      return { kind: linked ? "linked" : "invalid" };
    } catch (error) {
      // Este Telegram se activó en otra cuenta entre la lectura y la escritura.
      if (isUniqueViolation(error, "channel_links_active_external")) return { kind: "taken" };
      throw error;
    }
  }

  /** `/disconnect` desde Telegram. `true` si había un vínculo activo. */
  async unlinkByExternalId(externalId: string): Promise<boolean> {
    const userId = await this.resolveUser(externalId);
    if (!userId) return false;
    await this.db.runWithTenant(userId, (tx) => this.repo.revokeOwn(tx));
    return true;
  }

  /** De quién es un update de Telegram, o null si ese Telegram no está conectado. */
  async resolveUser(externalId: string): Promise<string | null> {
    const row = await this.db.runWorkerScan((tx) =>
      this.repo.findActiveByExternalId(tx, externalId),
    );
    return row?.userId ?? null;
  }
}

function toStatus(row: ChannelLinkRow | undefined, now: Date): TelegramLinkStatusDto {
  const empty = { username: null, linkedAt: null, expiresAt: null };
  if (!row || row.status === "revoked") return { state: "disconnected", ...empty };
  if (row.status === "active") {
    return {
      state: "connected",
      username: row.username,
      linkedAt: row.linkedAt?.toISOString() ?? null,
      expiresAt: null,
    };
  }
  const expiresAt = row.linkTokenExpiresAt;
  return {
    state: expiresAt && expiresAt > now ? "waiting" : "expired",
    username: null,
    linkedAt: null,
    expiresAt: expiresAt?.toISOString() ?? null,
  };
}
