import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import {
  MEMORY_TOOL_NAME,
  memorySearchInputSchema,
  type BrandVoiceForPrompt,
  type CardContent,
  type ChatSummary,
} from "@presencia/shared";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { RunTrace } from "../ai/run-trace.js";
import { AiService } from "../ai/ai.service.js";
import { BrandVoiceService } from "../brand-voice/brand-voice.service.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { buildPublicationCardTools } from "../cards/publication-card.tools.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { FoldersService } from "../folders/folders.service.js";
import { ChatTitleService } from "./chat-title.service.js";
import { toChatSummary, toUIMessage } from "./chat-summary.js";
import { contextTokensOf } from "./history-compaction.js";
import { HistoryCompactionService } from "./history-compaction.service.js";
import { MemoryService } from "./memory.service.js";
import {
  estimateTokens,
  pendingTokensAfterSummary,
  type HistorySummary,
} from "./history-window.js";
import { assembleContext, cardIdsForContext } from "./context-builder.js";
import { ChatRepository, type ChatSummaryRow } from "./chat.repository.js";
import { type CompressedCardOutput, type LiveCard } from "./context-diet.js";
import { buildSystemPrompt } from "./system-prompt.js";

// Margen para: tool call + reintento tras input inválido + texto de cierre.
// Si el modelo agota este presupuesto a mitad de una tool call, onEnd lo
// detecta (steps.length === MAX_AGENT_STEPS + finishReason "tool-calls") y
// lo loguea — el turno se persiste igual, truncado, sin bloquear al usuario.
const MAX_AGENT_STEPS = 5;
/** Cuánto espera la traza de un turno cortado a que termine la tool en curso. */
const ABORTED_TRACE_GRACE_MS = 3_000;

@Injectable()
export class ChatService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
    @Inject(BrandVoiceService) private readonly brandVoiceService: BrandVoiceService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly creditsService: CreditsService,
    @Inject(FoldersService) private readonly foldersService: FoldersService,
    @Inject(ChatTitleService) private readonly chatTitle: ChatTitleService,
    @Inject(HistoryCompactionService) private readonly compaction: HistoryCompactionService,
    @Inject(MemoryService) private readonly memory: MemoryService,
  ) {}

  createChat(userId: string, title?: string): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.createChat(tx, userId, title);
      return toChatSummary(chat);
    });
  }

  listChats(userId: string): Promise<ChatSummary[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listChats(tx);
      return rows.map((chat) => toChatSummary(chat));
    });
  }

  getMessages(userId: string, chatId: string): Promise<UIMessage[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const rows = await this.repo.listMessages(tx, chatId);
      return rows.map((row) => toUIMessage(row));
    });
  }

  renameChat(userId: string, chatId: string, title: string): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const updated = await this.repo.renameChat(tx, chatId, title);
      return toChatSummary(updated);
    });
  }

  listArchivedChats(userId: string): Promise<ChatSummary[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listArchivedChats(tx);
      return rows.map((chat) => toChatSummary(chat));
    });
  }

  archiveChat(userId: string, chatId: string): Promise<ChatSummary> {
    return this.setArchived(userId, chatId, true);
  }

  unarchiveChat(userId: string, chatId: string): Promise<ChatSummary> {
    return this.setArchived(userId, chatId, false);
  }

  private setArchived(userId: string, chatId: string, archived: boolean): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const updated = await this.repo.setArchived(tx, chatId, archived);
      return toChatSummary(updated);
    });
  }

  pinChat(userId: string, chatId: string): Promise<ChatSummary> {
    return this.setPinned(userId, chatId, true);
  }

  unpinChat(userId: string, chatId: string): Promise<ChatSummary> {
    return this.setPinned(userId, chatId, false);
  }

  // Un chat archivado no se puede fijar: el CHECK de la DB lo rechazaría
  // igual, pero como error 500 opaco en vez de un 409 que explique.
  private setPinned(userId: string, chatId: string, pinned: boolean): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      if (pinned && chat.archivedAt) {
        throw new ConflictException("No puedes fijar un chat archivado. Desarchívalo primero.");
      }
      const updated = await this.repo.setPinned(tx, chatId, pinned);
      return toChatSummary(updated);
    });
  }

  moveToFolder(userId: string, chatId: string, folderId: string | null): Promise<ChatSummary> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      // Confirma que folderId es una carpeta del tenant actual, dentro de
      // la MISMA transacción (mismo RLS) — un FK por sí solo no basta,
      // valida existencia física de la fila, no visibilidad por tenant
      // (ADR-003). Ver FoldersService.assertOwnsFolder.
      if (folderId) await this.foldersService.assertOwnsFolder(tx, folderId);
      const updated = await this.repo.moveToFolder(tx, chatId, folderId);
      return toChatSummary(updated);
    });
  }

  // No cancela publicaciones "scheduled" solo — es un compromiso real en
  // postfa.st, cancelarlo sin que el usuario lo haya pedido explícitamente
  // sería un bug, no una feature. "draft"/"published"/"failed"/"canceled"
  // sobreviven huérfanas (chatId → null, ver schema.ts) — no se destruye
  // el historial de algo que ya se publicó por borrar la conversación que
  // lo originó.
  deleteChat(userId: string, chatId: string): Promise<void> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const hasScheduled = await this.cardsRepo.hasScheduledCards(tx, chatId);
      if (hasScheduled) {
        throw new BadRequestException(
          "Este chat tiene publicaciones programadas — cancélalas o espera a que se publiquen antes de eliminarlo.",
        );
      }
      // Antes del DELETE y en la misma transacción: el SET NULL del FK no avisa
      // a las otras pestañas (F8.6).
      await this.cardsRepo.detachFromChat(tx, chatId);
      await this.repo.deleteChat(tx, chatId);
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
    // Bloqueo suave (F5, ADR-012): se rechaza antes de tocar la DB o quemar
    // tokens del proveedor — nunca deja un mensaje user huérfano sin respuesta.
    await this.assertQuotaForTurn(userId);
    const voicePromise = this.loadVoiceForPrompt(userId);
    const { history, summary } = await this.dbService.runWithTenant(userId, async (tx) => {
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
      return {
        history: [...previous, saved].map((row) => toUIMessage(row)),
        summary: await this.repo.getSummary(tx, chatId),
      };
    });

    await this.runAgentTurn(userId, chatId, history, toHistorySummary(summary), res, voicePromise);
  }

  // El 402 lo arma CreditsService, que es donde vive la traducción de
  // InsufficientQuotaError a HTTP para todas las puertas de cobro. Lo de acá
  // es el PISO: minimumTurnUnits es conservador a propósito, porque el costo
  // real del turno (charge(), en onEnd) casi siempre difiere y puede
  // superarlo — ese caso es sobregiro intencional, no bug de este gate.
  private async assertQuotaForTurn(userId: string): Promise<void> {
    await this.creditsService.assertQuotaOr402(userId, getRateCard().minimumTurnUnits);
  }

  /**
   * El contenido y estado de hoy de las cards, por id. `null` si la lectura
   * falló (no es lo mismo que "no existen"): el turno sigue con la foto del
   * historial, peor contexto pero no un chat caído.
   */
  private async loadLiveCardsByIds(
    userId: string,
    ids: string[],
  ): Promise<Map<string, LiveCard> | null> {
    if (ids.length === 0) return new Map();
    try {
      const rows = await this.dbService.runWithTenant(userId, (tx) =>
        this.cardsRepo.findContentByIds(tx, ids),
      );
      return new Map(
        rows.map((row) => [row.id, { content: row.content as CardContent, status: row.status }]),
      );
    } catch (error) {
      console.error("[chat] No se pudo leer el contenido vivo de las cards:", error);
      return null;
    }
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
  /**
   * `userMessageId` es el id del mensaje USER cuya respuesta se quiere
   * regenerar — no un id de mensaje assistant. Antes esta función esperaba
   * lo segundo (un `messageId` que el cliente nunca manda: la transport
   * real de useChat/DefaultChatTransport, al llamar regenerate(), NO
   * incluye ningún campo `messageId` — solo reenvía `messages` ya recortado
   * del lado del cliente, sin la respuesta vieja, terminando en el mensaje
   * user al que hay que responder de nuevo. Ese último mensaje del array SÍ
   * trae un id real y persistido — es lo que el controller ahora extrae
   * con el mismo `parseLastUserMessage` que usa el turno normal, en vez de
   * inventar un campo que el protocolo real nunca envía (bug encontrado
   * 2026-08-19: "Falta el id del mensaje a reintentar" en cada regenerate).
   */
  async regenerateChat(
    userId: string,
    chatId: string,
    userMessageId: string,
    res: ServerResponse,
  ): Promise<void> {
    await this.assertQuotaForTurn(userId);
    const voicePromise = this.loadVoiceForPrompt(userId);
    const { history, summary } = await this.dbService.runWithTenant(userId, async (tx) => {
      const chat = await this.repo.getChat(tx, chatId);
      if (!chat) throw new NotFoundException("Ese chat no existe.");
      const all = await this.repo.listMessages(tx, chatId);
      const targetIndex = all.findIndex((m) => m.id === userMessageId);
      const target = targetIndex === -1 ? undefined : all[targetIndex];
      const staleReply = targetIndex === -1 ? undefined : all[targetIndex + 1];
      // Solo se reintenta el último turno: el mensaje user tiene que ser
      // el último de la conversación (turno que falló antes de generar
      // respuesta — el botón "Reintentar" de un error) o el penúltimo,
      // seguido exactamente por la respuesta assistant a regenerar — sin
      // este chequeo se podría borrar un mensaje intermedio dejando un
      // hueco (dos turnos user seguidos) sin tocar los turnos posteriores.
      const isLast = targetIndex === all.length - 1;
      const isSecondToLastWithReply =
        targetIndex === all.length - 2 && staleReply?.role === "assistant";
      if (!target || target.role !== "user" || !(isLast || isSecondToLastWithReply)) {
        throw new NotFoundException("Ese mensaje no se puede reintentar.");
      }
      if (staleReply && (await this.cardsRepo.hasSentCards(tx, staleReply.id))) {
        throw new ConflictException(
          "Esta respuesta tiene publicaciones programadas o publicadas. Cancela la programación antes de regenerarla.",
        );
      }
      if (staleReply) {
        // Cards antes que mensaje: el FK message_id es "set null", no
        // cascade — sin este orden quedarían huérfanas en vez de borradas.
        await this.cardsRepo.deleteCardsByMessageId(tx, staleReply.id);
        await this.repo.deleteMessage(tx, staleReply.id);
      }
      return {
        history: all.slice(0, targetIndex + 1).map((row) => toUIMessage(row)),
        summary: await this.repo.getSummary(tx, chatId),
      };
    });

    await this.runAgentTurn(userId, chatId, history, toHistorySummary(summary), res, voicePromise);
  }

  // Pipeline compartido por streamChat y regenerateChat: streamText + tools
  // + persistencia en onEnd. `history` ya trae el turno user que
  // corresponde en cada caso.
  private async runAgentTurn(
    userId: string,
    chatId: string,
    history: UIMessage[],
    summary: HistorySummary | null,
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
    // Un groupId por turno, no por card — coincide con lo ya documentado
    // en presencia-chat.md (el toggle multi-red del drawer se dispara
    // cuando "la publicación se generó para múltiples redes en el mismo
    // turno"). Desde F10.5 también se pueden programar juntas cards de
    // turnos distintos (selección multired); en ese caso scheduleGroup les
    // da un groupId común al programarlas (CardsService.unifyGroup). Se
    // asigna siempre, incluso si el turno termina creando una sola card —
    // inocuo, esa card simplemente no tiene hermanas con el mismo groupId.
    const groupId = randomUUID();
    // F10.8.1: la traza del turno (ADR-026). Su id liga la respuesta, los
    // pasos del modelo y las tools, y lo que el turno dispara (título,
    // compactación, memoria) en ai_usage_events.
    const trace = new RunTrace(randomUUID());
    const tools = {
      ...buildPublicationCardTools({
        userId,
        chatId,
        dbService: this.dbService,
        cardsRepository: this.cardsRepo,
        createdCardIds,
        groupId,
      }),
      // F10.8: la memoria entre chats. El modelo la llama cuando el creator
      // alude a otra conversación (system-prompt.ts dice cuándo); busca en
      // sus OTROS chats. Nunca lanza: sin memoria, el turno sigue igual.
      [MEMORY_TOOL_NAME]: tool({
        description:
          "Busca en las conversaciones anteriores del creator (otros chats) lo que " +
          "hablaron sobre un tema. Úsala cuando se refiera a algo de otra conversación " +
          "que no está en esta. Devuelve fragmentos con el título del chat y la fecha.",
        inputSchema: memorySearchInputSchema,
        execute: ({ consulta }) => this.memory.search(userId, chatId, consulta, trace.runId),
      }),
    };

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
    trace.watchModel(() =>
      typeof resolved.model === "object"
        ? { provider: resolved.model.provider, modelId: resolved.model.modelId }
        : null,
    );
    const startedAt = Date.now();

    // Lo que el modelo ve (F10.8.1, context-builder.ts): el resumen en lugar
    // del tramo viejo (mensajes ENTEROS, nunca partes: la regla del reasoning
    // item de abajo), las cards como son hoy, la dieta y el techo. Las cards
    // del resumen y las de la ventana se leen de una sola vez. `history` no
    // se toca: la UI y lo que se persiste siguen siendo la conversación
    // completa.
    const context = assembleContext(
      history,
      summary,
      await this.loadLiveCardsByIds(userId, cardIdsForContext(history, summary)),
      env.CHAT_HISTORY_CAP_TOKENS,
    );
    const modelHistory = context.messages;

    const result = streamText({
      model: resolved.model,
      system: buildSystemPrompt(voice),
      // Dieta de contexto (F4.5): al modelo solo le llega íntegro el content
      // de las últimas cards (keepFull, default en context-diet.ts — no se
      // repite el número aquí para no tener que mantenerlo en dos lugares).
      // El resto va comprimido a un resumen. Nunca toca `history` en sí:
      // `originalMessages` abajo sigue siendo el historial completo, así el
      // merge del SDK y lo que se persiste en onEnd no se contaminan con la
      // versión comprimida.
      //
      // NO se descarta el `reasoning` de turnos viejos (se evaluó y se
      // revirtió, 2026-08-09): OpenAI Responses API exige que cada mensaje
      // de texto viaje junto a su reasoning item original — quitarlo rompe
      // el request con 400 "was provided without its required reasoning
      // item". El reasoning sigue viajando completo en cada turno; es un
      // hueco de contexto conocido (ver ADR-006 addendum), no algo que se
      // pueda recortar del lado del cliente sin cambiar de API mode.
      // F10.5: con el contenido VIVO de cada card (editada, restaurada,
      // cambiada por la IA), no el que quedó congelado en messages.parts.
      messages: await convertToModelMessages(modelHistory),
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      abortSignal: abortController.signal,
      onStepStart: (event) => trace.stepStarted(event),
      onStepFinish: (step) => trace.stepFinished(step),
      experimental_onToolCallFinish: (event) => trace.toolFinished(event),
      // Un turno cortado no se cobra, pero su traza sí se guarda: el paso que
      // quedó a medias, como `aborted`. Se escribe en onEnd (que corre igual,
      // ver abajo); el temporizador es el seguro por si no llegara. La espera
      // deja entrar a la tool que todavía estaba corriendo al cortar.
      onAbort: () => {
        trace.close("aborted");
        setTimeout(
          () => void this.aiUsage.registrarTraza(userId, chatId, trace),
          ABORTED_TRACE_GRACE_MS,
        );
      },
    });

    // Desde ai 7.0.1xx devuelve una promesa que se cumple al cerrar el stream.
    // No se espera: los headers ya salieron, así que un rechazo no tiene a
    // quién responderle (el filtro de Nest intentaría mandar un 500 encima).
    // Solo se registra; el usuario ya recibió el error por `onError`.
    void result
      .pipeUIMessageStreamToResponse(res, {
        originalMessages: history,
        onError: (error) => {
          console.error("Error en el stream del chat:", error);
          trace.failed(error);
          return "Algo salió mal generando la respuesta. Inténtalo de nuevo.";
        },
        onEnd: async ({ responseMessage, isAborted, finishReason }) => {
          if (isAborted) {
            trace.close("aborted");
            void this.aiUsage.registrarTraza(userId, chatId, trace);
            return;
          }

          // Se lee una sola vez, antes de las dos transacciones de abajo: si
          // esto falla, ni el mensaje ni el cobro se persisten. Es lo que pasa
          // cuando el creator corta el turno: `isAborted` llega en false y
          // `totalUsage` rechaza con AbortError. Los tokens de ese turno quedan
          // sin cobrar y sin fila en ai_usage_events (hueco conocido, ver PR
          // feat/f45-usage-telemetry); desde F10.8.1 sí queda su traza, con
          // el paso cortado como `aborted`.
          let usage: Awaited<typeof result.totalUsage>;
          let steps: Awaited<typeof result.steps>;
          try {
            [usage, steps] = await Promise.all([result.totalUsage, result.steps]);
          } catch (error) {
            console.error(
              `[chat] No se pudo leer el usage del turno de chat ${chatId}; ni el mensaje ni el cobro se persisten:`,
              error,
            );
            trace.close(abortController.signal.aborted ? "aborted" : "error", error);
            void this.aiUsage.registrarTraza(userId, chatId, trace);
            return;
          }
          // El error ya lo vio onError (trace.failed); aquí solo se cierra el paso.
          if (finishReason === "error") trace.close("error");

          if (steps.length >= MAX_AGENT_STEPS && finishReason === "tool-calls") {
            console.warn(
              `[chat] Turno truncado por el límite de ${MAX_AGENT_STEPS} steps ` +
                `(chat ${chatId}): el modelo aún quería llamar otra tool.`,
            );
          }

          // El id de la respuesta guardada; null si no se guardó.
          let savedId: string | null = null;
          try {
            savedId = await this.dbService.runWithTenant(userId, async (tx) => {
              const saved = await this.repo.insertMessage(tx, {
                chatId,
                userId,
                role: "assistant",
                parts: responseMessage.parts,
                runId: trace.runId,
              });
              await this.repo.touchChat(tx, chatId);
              if (createdCardIds.length > 0) {
                await this.cardsRepo.linkCardsToMessage(tx, createdCardIds, saved.id);
              }
              // Cobro real con el usage real del turno, en la MISMA
              // transacción que el mensaje que cobra (modelo-de-datos.md: "o
              // se cobra y se produce, o ninguna de las dos"). charge() puede
              // dejar saldo negativo a propósito — el gate de arriba es lo
              // que evita que esto sea frecuente, no esto.
              await this.creditsService.charge(tx, {
                userId,
                usage: chargeUsageOf(usage),
                taskKind: "chat",
                reason: "chat_message",
                referenceType: "message",
                referenceId: saved.id,
              });
              return saved.id;
            });
          } catch (error) {
            console.error(
              `[chat] onEnd falló para chat ${chatId} (turno no abortado). ` +
                `Cards de este turno posiblemente huérfanas: ` +
                `${createdCardIds.length > 0 ? createdCardIds.join(", ") : "ninguna"}.`,
              error,
            );
          }

          // Fuera de la transacción del mensaje, y AiUsageService nunca lanza:
          // un fallo al registrar usage no puede costar el mensaje ni el cobro,
          // que ya se persistieron arriba.
          await this.aiUsage.registrar(
            {
              userId,
              chatId,
              task: "chat",
              modelo: resolved,
              usage,
              stepsCount: steps.length,
              arranque: startedAt,
              runId: trace.runId,
              providerRaw: {
                steps: steps.map((step) => ({
                  usage: step.usage,
                  providerMetadata: step.providerMetadata,
                })),
                finishReason,
              },
              // La traza, en la misma transacción que la fila de uso.
            },
            trace,
          );

          // F10.8: el título automático, sin esperarlo — el turno ya terminó.
          // Decide solo si toca (primeras respuestas, título de nacimiento).
          // Solo sobre una respuesta que quedó guardada y no terminó en error:
          // titular (y cobrar) a partir de algo que no está en la conversación
          // dejaría un título que nadie puede explicar.
          if (savedId && finishReason !== "error") {
            void this.chatTitle.maybeTitle(
              userId,
              chatId,
              [...history, responseMessage],
              trace.runId,
            );
            // F10.8: si el contexto de este turno ya pesa, se resume el tramo
            // viejo en segundo plano para que el siguiente viaje más ligero.
            // La respuesta de este turno también cuenta como pendiente.
            void this.compaction.maybeEnqueue(
              userId,
              chatId,
              contextTokensOf(steps),
              pendingTokensAfterSummary(history, summary) + estimateTokens([responseMessage]),
              trace.runId,
            );
            // F10.8: el intercambio entra a la memoria entre chats.
            void this.memory.enqueueIndex(userId, chatId, savedId, trace.runId);
          }
        },
      })
      .catch((error: unknown) => {
        console.error("Error escribiendo el stream del chat:", error);
      });
  }
}

/** La fila de `chat_summaries` como la usa la ventana del historial. */
function toHistorySummary(row: ChatSummaryRow | undefined): HistorySummary | null {
  if (!row) return null;
  return {
    summary: row.summary,
    throughMessageId: row.throughMessageId,
    cards: row.cards as CompressedCardOutput[],
  };
}
