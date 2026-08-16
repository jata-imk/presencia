import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  channelAccountIdParamSchema,
  channelIntentIdParamSchema,
  type ChannelAccountDto,
  type ConnectIntentDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { ChannelsService } from "./channels.service.js";

@Controller("channels")
export class ChannelsController {
  constructor(@Inject(ChannelsService) private readonly service: ChannelsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<ChannelAccountDto[]> {
    return this.service.listAccounts(user.id);
  }

  @Post("connect-intent")
  createIntent(@CurrentUser() user: SessionUser): Promise<ConnectIntentDto> {
    return this.service.createConnectIntent(user.id);
  }

  @Post("connect-intent/:id/claim")
  claim(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<ChannelAccountDto[]> {
    const parsed = channelIntentIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la conexión no es válido.");
    return this.service.claimConnectIntent(user.id, parsed.data.id);
  }

  @Delete(":id")
  @HttpCode(204)
  async disconnect(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<void> {
    const parsed = channelAccountIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la cuenta no es válido.");
    await this.service.disconnectAccount(user.id, parsed.data.id);
  }

  // Reactivar una cuenta que YA es nuestra (desconectada solo del lado de
  // Presencia) es directo — no pasa por connect-intent/claim porque no hace
  // falta volver a autorizar nada en PostFast (ver ChannelsService).
  @Patch(":id/reactivate")
  reactivate(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
  ): Promise<ChannelAccountDto> {
    const parsed = channelAccountIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la cuenta no es válido.");
    return this.service.reactivateAccount(user.id, parsed.data.id);
  }
}
