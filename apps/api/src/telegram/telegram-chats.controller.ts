import { BadRequestException, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { chatIdParamSchema, type TelegramContinueDto } from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { TelegramBotService } from "./telegram-bot.service.js";

// Llevar un chat de la web a Telegram (F11 PR7b, ADR-030): el menú ··· del
// chat, "Continuar en Telegram". Con sesión: el chat se busca con el RLS del
// creator.

@Controller("telegram/chats")
export class TelegramChatsController {
  constructor(@Inject(TelegramBotService) private readonly bot: TelegramBotService) {}

  /** El bot abre (o reusa) el tema del chat y escribe en él. */
  @Post(":id/continue")
  @HttpCode(200)
  continue(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
  ): Promise<TelegramContinueDto> {
    const parsed = chatIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id del chat no es válido.");
    return this.bot.continueChat(user.id, parsed.data.id);
  }
}
