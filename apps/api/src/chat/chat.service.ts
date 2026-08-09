import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { BrandVoiceForPrompt, ChatSummary } from "@presencia/shared";
import type { ServerResponse } from "node:http";
import { AiUsageRepository } from "../ai/ai-usage.repository.js";
import { AiService } from "../ai/ai.service.js";
import { BrandVoiceService } from "../brand-voice/brand-voice.service.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { buildPublicationCardTools } from "../cards/publication-card.tools.js";
import { DbService } from "../db/db.service.js";
import { ChatRepository, type MessageRow } from "./chat.repository.js";
import { buildSystemPrompt } from "./system-prompt.js";

// Margen para: tool call + reintento tras input inválido + texto de cierre.
// Si el modelo agota este presupuesto a mitad de una tool call, onEnd lo
// detecta (steps.length === MAX_AGENT_STEPS + finishReason "tool-calls") y
// lo loguea — el turno se persiste igual, truncado, sin bloquear al usuario.
const MAX_AGENT_STEPS = 5;

@Injectable()
export class ChatService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
    @Inject(BrandVoiceService) private readonly brandVoiceService: BrandVoiceService,
    @Inject(AiUsageRepository) private readonly aiUsageRepo: AiUsageRepository,
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

  renameChat(userId: string, chatId: string, title: string): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const updated = await this.repo.renameChat(tx, chatId, title);
      return this.toSummary(updated);
    });
  }

  /**
   * Turno normal: inserta el mensaje user, carga el historial canónico
   * desde la DB (se ignora lo demás del body) y corre el pipeline del
   * agente.
   */
  async streamChat(
    userId: string,
    chatId: string,
    userMessage: UIMessage,
    res: ServerResponse,
  ): Promise<void> {
    const voicePromise = this.loadVoiceForPrompt(userId);
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

    await this.runAgentTurn(userId, chatId, history, res, voicePromise);
  }

  // Nunca debe tumbar el turno: una voz de marca que no cargó cae al
  // prompt base, igual que una cuenta sin voz configurada. Se dispara en
  // paralelo con la carga del historial (no depende de ella) en vez de
  // encadenarse después, para no pagar dos round-trips secuenciales a la
  // DB en el hot path de cada turno.
  private loadVoiceForPrompt(userId: string): Promise<BrandVoiceForPrompt | null> {
    return this.brandVoiceService.getDefaultForPrompt(userId).catch((error: unknown) => {
      console.error(
        `[chat] No se pudo cargar la voz de marca de ${userId} para este turno:`,
        error,
      );
      return null;
    });
  }

  /**
   * Reintento ("Reintentar" en UI, ADR-006 addendum F3 PR3): borra el
   * mensaje assistant a regenerar y sus cards vinculadas (decisión de
   * producto: no quedan huérfanas), y vuelve a correr el pipeline con el
   * historial que queda — el turno user ya estaba persistido, no se
   * inserta nada nuevo.
   */
  async regenerateChat(
    userId: string,
    chatId: string,
    messageId: string,
    res: ServerResponse,
  ): Promise<void> {
    const voicePromise = this.loadVoiceForPrompt(userId);
    const history = await this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const all = await this.repo.listMessages(tx, chatId);
      const last = all.at(-1);
      // Solo se reintenta el último turno: messageId viaja del cliente, y
      // sin este chequeo se podría borrar un mensaje intermedio dejando un
      // hueco en la conversación (dos turnos user seguidos) sin tocar los
      // turnos posteriores.
      if (!last || last.id !== messageId || last.role !== "assistant") {
        throw new NotFoundException("Ese mensaje no se puede reintentar.");
      }
      // Cards antes que mensaje: el FK message_id es "set null", no
      // cascade — sin este orden quedarían huérfanas en vez de borradas.
      await this.cardsRepo.deleteCardsByMessageId(tx, messageId);
      await this.repo.deleteMessage(tx, messageId);
      return all.slice(0, -1).map((row) => this.toUIMessage(row));
    });

    await this.runAgentTurn(userId, chatId, history, res, voicePromise);
  }

  // Pipeline compartido por streamChat y regenerateChat: streamText + tools
  // + persistencia en onEnd. `history` ya trae el turno user que
  // corresponde en cada caso.
  private async runAgentTurn(
    userId: string,
    chatId: string,
    history: UIMessage[],
    res: ServerResponse,
    voicePromise: Promise<BrandVoiceForPrompt | null>,
  ): Promise<void> {
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

    // Voz de marca del usuario (F4): null durante el onboarding, para
    // cuentas viejas sin voz configurada, o si la carga falló — ver
    // loadVoiceForPrompt. buildSystemPrompt cae al prompt base en ese caso,
    // el chat nunca se bloquea por esto.
    const voice = await voicePromise;

    // Resuelto una sola vez: el mismo objeto alimenta streamText y la
    // telemetría de abajo, así es imposible que ai_usage_events reporte un
    // proveedor/modelo distinto del que de verdad corrió (F4.5). "chat" es
    // la tarea que este pipeline siempre ejecuta (routing por tarea, F4.5).
    const resolved = this.aiService.resolveForTask("chat");
    const startedAt = Date.now();

    const result = streamText({
      model: resolved.model,
      system: buildSystemPrompt(voice),
      messages: await convertToModelMessages(history),
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      abortSignal: abortController.signal,
    });

    result.pipeUIMessageStreamToResponse(res, {
      originalMessages: history,
      onError: (error) => {
        console.error("Error en el stream del chat:", error);
        return "Algo salió mal generando la respuesta. Inténtalo de nuevo.";
      },
      onEnd: async ({ responseMessage, isAborted, finishReason }) => {
        if (isAborted) return;
        try {
          const steps = await result.steps;
          if (steps.length >= MAX_AGENT_STEPS && finishReason === "tool-calls") {
            console.warn(
              `[chat] Turno truncado por el límite de ${MAX_AGENT_STEPS} steps ` +
                `(chat ${chatId}): el modelo aún quería llamar otra tool.`,
            );
          }
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
        } catch (error) {
          console.error(
            `[chat] onEnd falló para chat ${chatId} (turno no abortado). ` +
              `Cards de este turno posiblemente huérfanas: ` +
              `${createdCardIds.length > 0 ? createdCardIds.join(", ") : "ninguna"}.`,
            error,
          );
        }

        // Try/catch propio (F4.5): un fallo al registrar usage nunca debe
        // costar el mensaje del usuario, que ya se persistió arriba. En un
        // turno abortado no se llega aquí — los tokens de esa llamada
        // quedan sin medir (hueco conocido, ver PR feat/f45-usage-telemetry).
        try {
          const [usage, steps] = await Promise.all([result.totalUsage, result.steps]);
          await this.dbService.runWithTenant(userId, (tx) =>
            this.aiUsageRepo.insertEvent(tx, {
              userId,
              chatId,
              taskKind: "chat",
              provider: resolved.provider,
              model: resolved.modelName,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? null,
              stepsCount: steps.length,
              durationMs: Date.now() - startedAt,
              providerRaw: {
                steps: steps.map((step) => ({
                  usage: step.usage,
                  providerMetadata: step.providerMetadata,
                })),
                finishReason,
              },
            }),
          );
        } catch (error) {
          console.error(`[chat] No se pudo registrar usage para chat ${chatId}:`, error);
        }
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
