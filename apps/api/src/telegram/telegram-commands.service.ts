import { Inject, Injectable } from "@nestjs/common";
import { env } from "../env.js";
import { copy } from "./telegram.copy.js";
import { looksLikeLinkToken } from "./link-token.js";
import { TelegramLinksService } from "./telegram-links.service.js";

// Qué contesta el bot a cada comando y mensaje (F11, ADR-030), sin grammY:
// recibe quién escribió y qué, y devuelve el texto de la respuesta. Así se
// prueba sin Telegram, y el servicio del bot solo traduce updates.

/** Quién escribió: el usuario de Telegram del update (`from`). */
export interface TelegramSender {
  id: number;
  username?: string;
}

@Injectable()
export class TelegramCommandsService {
  constructor(@Inject(TelegramLinksService) private readonly links: TelegramLinksService) {}

  /** `/start` y `/start <código>` (el deep link de Configuración). */
  async start(from: TelegramSender, payload: string): Promise<string> {
    const externalId = String(from.id);
    if (!payload) {
      return (await this.links.resolveUser(externalId))
        ? copy.alreadyLinked
        : copy.notLinked(env.WEB_URL);
    }
    if (!looksLikeLinkToken(payload)) return copy.invalid(env.WEB_URL);
    const result = await this.links.redeem(payload, externalId, from.username ?? null);
    switch (result.kind) {
      case "linked":
        return copy.linked;
      case "already_linked":
        return copy.alreadyLinked;
      case "expired":
        return copy.expired(env.WEB_URL);
      case "taken":
        return copy.taken;
      case "invalid":
        return copy.invalid(env.WEB_URL);
    }
  }

  async help(from: TelegramSender): Promise<string> {
    return (await this.links.resolveUser(String(from.id)))
      ? copy.help
      : copy.notLinked(env.WEB_URL);
  }

  async disconnect(from: TelegramSender): Promise<string> {
    return (await this.links.unlinkByExternalId(String(from.id)))
      ? copy.disconnected
      : copy.notLinkedToDisconnect;
  }

  /**
   * Un mensaje que el turno no lee (el texto, las fotos y los archivos van a
   * TelegramConversationService). Quien no está conectado recibe cómo
   * conectarse, y nada se cobra. El que sí lo está: que eso no se lee (un
   * video, una video-nota, un sticker…).
   */
  async message(from: TelegramSender): Promise<string> {
    if (!(await this.links.resolveUser(String(from.id)))) return copy.notLinked(env.WEB_URL);
    return copy.unsupported;
  }
}
