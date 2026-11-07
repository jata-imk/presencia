import { Injectable } from "@nestjs/common";
import { Api } from "grammy";
import { env } from "../env.js";
import { sendMail } from "../mailer/mailer.js";
import type { MensajeDeOps } from "./mensaje.js";

/**
 * Manda el aviso de operación al founder (F12.8, ADR-031).
 *
 * Telegram directo desde el proceso que lo genere (el worker en prod), con el
 * token del bot y la `Api` suelta de grammY: `sendMessage` no consume updates,
 * así que no choca con el webhook ni con el polling de `app`. No pasa por
 * `TelegramBotService` a propósito: ese vive solo en `app` (addendum F11 de
 * ADR-008), y un aviso que dependiera de `app` viva se perdería justo cuando
 * `app` es lo que se cayó.
 *
 * Si Telegram falla (token revocado, red), cae a correo. Nunca lanza.
 */
// Techo de cada canal. Los dos juntos quedan muy por debajo de los 4 minutos
// de `ops.watch`: un Telegram o un ZeptoMail colgados no pueden hacer que el
// pase expire, porque entonces no se guarda el estado ni sale el latido.
// grammY trae 500 s por default.
const TELEGRAM_TIMEOUT_S = 20;
const CORREO_TIMEOUT_MS = 20_000;

@Injectable()
export class OpsAlertSender {
  private api: Api | null = null;

  /** true si el aviso salió por algún canal (o si no hay ninguno configurado). */
  async enviar(mensaje: MensajeDeOps): Promise<boolean> {
    const chatId = env.OPS_TELEGRAM_CHAT_ID;
    const correo = env.OPS_ALERT_EMAIL;

    // En dev lo normal es no tener canal: el log es el aviso. Contarlo como
    // enviado evita que el mismo aviso se reintente cada cinco minutos.
    if (chatId === undefined && !correo) {
      console.warn(
        `[ops] sin canal configurado; el aviso queda solo en el log: ${mensaje.subject}`,
      );
      return true;
    }

    if (chatId !== undefined && env.TELEGRAM_BOT_TOKEN) {
      try {
        this.api ??= new Api(env.TELEGRAM_BOT_TOKEN, { timeoutSeconds: TELEGRAM_TIMEOUT_S });
        await this.api.sendMessage(chatId, mensaje.telegramHtml, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        return true;
      } catch (error) {
        console.error("[ops] el aviso por Telegram falló; se intenta por correo:", error);
      }
    }

    if (correo) {
      try {
        await sendMail({
          to: correo,
          subject: mensaje.subject,
          html: mensaje.emailHtml,
          timeoutMs: CORREO_TIMEOUT_MS,
        });
        return true;
      } catch (error) {
        console.error("[ops] el aviso por correo también falló:", error);
      }
    }
    return false;
  }
}
