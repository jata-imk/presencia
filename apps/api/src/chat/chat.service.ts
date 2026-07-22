import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { ChatSummary } from "@presencia/shared";
import type { ServerResponse } from "node:http";
import { AiService } from "../ai/ai.service.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { buildPublicationCardTools } from "../cards/publication-card.tools.js";
import { DbService } from "../db/db.service.js";
import { ChatRepository, type MessageRow } from "./chat.repository.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

@Injectable()
export class ChatService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
  ) {}

  createChat(userId: string, title?: string): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.createChat(tx, userId, title);
      return this.toSummary(chat);
    });
  }

  listChats(userId: string): Promise<ChatSummary[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listChats(tx);
      return rows.map((chat) => this.toSummary(chat));
    });
  }

  getMessages(userId: string, chatId: string): Promise<UIMessage[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const rows = await this.repo.listMessages(tx, chatId);
      return rows.map((row) => this.toUIMessage(row));
    });
  }

  /**
   * El hilo completo del esqueleto: tx corta que persiste el mensaje user y
   * carga el historial canónico desde la DB (se ignora lo demás del body),
   * stream del LLM sin transacción abierta, y tx corta en onEnd que
   * persiste la respuesta — nunca parciales de un stream abortado.
   */
  async streamChat(
    userId: string,
    chatId: string,
    userMessage: UIMessage,
    res: ServerResponse,
  ): Promise<void> {
    const history = await this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const previous = await this.repo.listMessages(tx, chatId);
      const saved = await this.repo.insertMessage(tx, {
        chatId,
        userId,
        role: "user",
        parts: userMessage.parts,
      });
      await this.repo.touchChat(tx, chatId);
      return [...previous, saved].map((row) => this.toUIMessage(row));
    });

    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abortController.abort();
    });

    // Ids de las cards creadas durante este turno (closure compartido con la
    // tool): onEnd las vincula al mensaje assistant una vez que existe.
    const createdCardIds: string[] = [];
    const tools = buildPublicationCardTools({
      userId,
      chatId,
      dbService: this.dbService,
      cardsRepository: this.cardsRepo,
      createdCardIds,
    });

    const result = streamText({
      model: this.aiService.resolveModel(),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(history),
      tools,
      stopWhen: stepCountIs(5),
      abortSignal: abortController.signal,
    });

    result.pipeUIMessageStreamToResponse(res, {
      originalMessages: history,
      onError: (error) => {
        console.error("Error en el stream del chat:", error);
        return "Algo salió mal generando la respuesta. Inténtalo de nuevo.";
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        if (isAborted) return;
        await this.dbService.runWithTenant(userId, async (tx) => {
          const saved = await this.repo.insertMessage(tx, {
            chatId,
            userId,
            role: "assistant",
            parts: responseMessage.parts,
          });
          await this.repo.touchChat(tx, chatId);
          if (createdCardIds.length > 0) {
            await this.cardsRepo.linkCardsToMessage(tx, createdCardIds, saved.id);
          }
        });
      },
    });
  }

  private toSummary(chat: {
    id: string;
    title: string;
    lastMessageAt: Date | null;
    createdAt: Date;
  }): ChatSummary {
    return {
      id: chat.id,
      title: chat.title,
      lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
      createdAt: chat.createdAt.toISOString(),
    };
  }

  // El id de fila (uuid) sustituye al id efímero del cliente al rehidratar.
  private toUIMessage(row: MessageRow): UIMessage {
    return {
      id: row.id,
      role: row.role as UIMessage["role"],
      parts: row.parts as UIMessage["parts"],
    };
  }
}
