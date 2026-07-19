import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { chatIdParamSchema, createChatBodySchema, type ChatSummary } from "@presencia/shared";
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

  @Get(":id/messages")
  messages(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<UIMessage[]> {
    return this.chatService.getMessages(user.id, this.parseChatId(id));
  }

  // Streaming SSE (ADR-006): con @Res() Nest no toca la respuesta; el
  // AI SDK escribe el stream directo sobre el ServerResponse.
  @Post(":id/stream")
  async stream(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const chatId = this.parseChatId(id);
    const userMessage = await this.parseLastUserMessage(body);
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
