import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import { safeValidateUIMessages, type UIMessage } from "ai";
import {
  chatIdParamSchema,
  chatStreamBodySchema,
  createChatBodySchema,
  moveChatBodySchema,
  renameChatBodySchema,
  type ChatSummary,
} from "@presencia/shared";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { ChatService } from "./chat.service.js";

@Controller("chats")
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<ChatSummary> {
    const parsed = createChatBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("El título no es válido.");
    return this.chatService.createChat(user.id, parsed.data.title);
  }

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<ChatSummary[]> {
    return this.chatService.listChats(user.id);
  }

  // Ruta estática, sin colisión con ":id/messages" (distinto número de
  // segmentos) — ver ArchivedView en Chat Part 3.html: pantalla aparte, no
  // un filtro sobre la misma lista.
  @Get("archived")
  listArchived(@CurrentUser() user: SessionUser): Promise<ChatSummary[]> {
    return this.chatService.listArchivedChats(user.id);
  }

  @Get(":id/messages")
  messages(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<UIMessage[]> {
    return this.chatService.getMessages(user.id, this.parseChatId(id));
  }

  @Patch(":id")
  rename(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ChatSummary> {
    const chatId = this.parseChatId(id);
    const parsed = renameChatBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("El título no es válido.");
    return this.chatService.renameChat(user.id, chatId, parsed.data.title);
  }

  @Patch(":id/folder")
  moveToFolder(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ChatSummary> {
    const chatId = this.parseChatId(id);
    const parsed = moveChatBodySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("El id de la carpeta no es válido.");
    return this.chatService.moveToFolder(user.id, chatId, parsed.data.folderId);
  }

  @Post(":id/archive")
  archive(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<ChatSummary> {
    return this.chatService.archiveChat(user.id, this.parseChatId(id));
  }

  @Post(":id/unarchive")
  unarchive(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<ChatSummary> {
    return this.chatService.unarchiveChat(user.id, this.parseChatId(id));
  }

  @Delete(":id")
  @HttpCode(204)
  async delete(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<void> {
    await this.chatService.deleteChat(user.id, this.parseChatId(id));
  }

  // Streaming SSE (ADR-006): con @Res() Nest no toca la respuesta; el
  // AI SDK escribe el stream directo sobre el ServerResponse. `trigger`
  // distingue turno nuevo (submit-message) de reintento (regenerate-message,
  // ADR-006 addendum F3 PR3) — mismo endpoint, mismo protocolo de useChat.
  @Post(":id/stream")
  async stream(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const chatId = this.parseChatId(id);
    const trigger = chatStreamBodySchema.safeParse(body ?? {});
    if (!trigger.success) throw new BadRequestException("La solicitud no es válida.");

    // El último mensaje del body SIEMPRE es el user al que hay que
    // responder — para un turno normal o para un regenerate, useChat lo
    // manda igual (regenerate() ya recortó del lado del cliente cualquier
    // respuesta assistant vieja antes de reenviar). No hay un campo
    // `messageId` separado que el protocolo real envíe.
    const userMessage = await this.parseLastUserMessage(body);

    if (trigger.data.trigger === "regenerate-message") {
      await this.chatService.regenerateChat(user.id, chatId, userMessage.id, res);
      return;
    }

    await this.chatService.streamChat(user.id, chatId, userMessage, res);
  }

  private parseChatId(id: string): string {
    const parsed = chatIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id del chat no es válido.");
    return parsed.data.id;
  }

  // El server solo toma el último mensaje user del body; el resto del
  // historial se reconstruye desde la DB (fuente de verdad única).
  private async parseLastUserMessage(body: unknown): Promise<UIMessage> {
    const messages = (body as { messages?: unknown })?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestException("Falta el mensaje.");
    }
    const validated = await safeValidateUIMessages({ messages: [messages.at(-1)] });
    if (!validated.success || validated.data[0]?.role !== "user") {
      throw new BadRequestException("El mensaje no es válido.");
    }
    return validated.data[0];
  }
}
