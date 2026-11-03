import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Update } from "grammy/types";
import { timingSafeEqual } from "node:crypto";
import { Public } from "../auth/public.decorator.js";
import { env } from "../env.js";
import { TelegramBotService } from "./telegram-bot.service.js";

// El webhook del bot (F11, ADR-030): Telegram manda cada update aquí, en prod.
// Público (sin sesión de Presencia); lo que lo protege es el secret de
// setWebhook, que Telegram repite en el header X-Telegram-Bot-Api-Secret-Token.
//
// Contesta 200 en cuanto acepta el update y lo atiende después: Telegram
// reintenta lo que no recibe a tiempo, y un turno del chat tarda más que eso.

/** Comparación en tiempo constante: el tiempo de respuesta no delata el secret. */
export function secretMatches(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Public()
@Controller("telegram")
export class TelegramWebhookController {
  constructor(@Inject(TelegramBotService) private readonly bot: TelegramBotService) {}

  @Post("webhook")
  @HttpCode(200)
  receive(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() body: unknown,
  ): { ok: true } {
    // Sin el secret correcto no se dice nada más: ni si el bot existe.
    if (!secretMatches(secret, env.TELEGRAM_WEBHOOK_SECRET)) throw new UnauthorizedException();
    // Arrancando o apagado: Telegram reintenta, y para entonces ya está.
    if (!this.bot.acceptsWebhook) throw new ServiceUnavailableException();
    const update = body as Partial<Update> | null;
    if (typeof update?.update_id !== "number") throw new BadRequestException();
    void this.bot.handleUpdate(update as Update).catch((error: unknown) => {
      console.error("[telegram] No se pudo atender un update del webhook:", error);
    });
    return { ok: true };
  }
}
