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
  type MessageStatus,
} from "@presencia/shared";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { RunTrace } from "../ai/run-trace.js";
import { AiService } from "../ai/ai.service.js";
import { AttachmentsService } from "../attachments/attachments.service.js";
import { BrandVoiceService } from "../brand-voice/brand-voice.service.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { buildPublicationCardTools } from "../cards/publication-card.tools.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService, type Tx } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-error.js";
import { env } from "../env.js";
import { FoldersService } from "../folders/folders.service.js";
import { ChatTitleService } from "./chat-title.service.js";
import { toChatSummary, toUIMessage } from "./chat-summary.js";
import { blocksOf, contextTokensOf } from "./history-compaction.js";
import { HistoryCompactionService } from "./history-compaction.service.js";
import { MemoryService } from "./memory.service.js";
import { pendingAfterSummary, type HistorySummary } from "./history-window.js";
import { assembleContext, cardIdsForContext } from "./context-builder.js";
import { ChatRepository, type ChatSummaryRow, type MessageRow } from "./chat.repository.js";
import { cardIdsIn, type CompressedCardOutput, type LiveCard } from "./context-diet.js";
import { sanitizeInterruptedParts } from "./interrupted-turn.js";
import { lastTurnOf, storableMessageId } from "./last-user-message.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { TurnCards } from "./turn-cards.js";

// Margen para: tool call + reintento tras input inválido + texto de cierre.
// Si el modelo agota este presupuesto a mitad de una tool call, onEnd lo
// detecta (steps.length === MAX_AGENT_STEPS + finishReason "tool-calls") y
// lo loguea — el turno se persiste igual, truncado, sin bloquear al usuario.
const MAX_AGENT_STEPS = 5;
/** Cuánto espera la traza de un turno cortado a que termine la tool en curso. */
const ABORTED_TRACE_GRACE_MS = 3_000;
/**
 * Cuánto espera un turno a que se termine de guardar el anterior del mismo
 * chat (F10.8.2). Guardar uno cortado tarda milisegundos; el tope es para no
 * colgar un turno si otro sigue respondiendo en otra pestaña.
 */
const TURN_WAIT_MS = 10_000;

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
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
  ) {}

  /**
   * Los turnos que todavía se están guardando, por chat (F10.8.2). Un turno
   * cortado se guarda en `onEnd`, DESPUÉS de que el cliente ya cerró la
   * conexión: un "Reintentar" inmediato podía leer el historial antes y dejar
   * la respuesta cortada guardada después de la nueva. En memoria porque el
   * chat corre en una sola instancia (el contenedor `app`, ADR-020); con
   * varias, esto tendría que ir a la base.
   */
  private readonly turnsInFlight = new Map<string, TurnInFlight>();

  /** Espera a que termine de guardarse el turno en curso del chat, con tope. */
  private async afterTurnInFlight(chatId: string): Promise<void> {
    // Solo si su conexión ya cerró (se cortó, o terminó y se está guardando):
    // uno que sigue respondiendo en otra pestaña no frena a este.
    const turn = this.turnsInFlight.get(chatId);
    if (!turn?.closed()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      turn.done,
      new Promise((resolve) => {
        timer = setTimeout(resolve, TURN_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /**
   * Registra un turno del chat desde que entra. El corte se escucha desde aquí
   * y no desde el pipe: un "close" mientras se arma el turno (la cuota, el
   * mensaje del creator) no se repite, y sin escucharlo el turno corría
   * completo para nadie y se guardaba como completo.
   */
  private trackTurn(chatId: string, res: ServerResponse): TurnInFlight {
    let resolve!: () => void;
    const done = new Promise<void>((r) => {
      resolve = r;
    });
    let closed = false;
    const abortController = new AbortController();
    const onClose = () => {
      closed = true;
      if (!res.writableFinished) abortController.abort();
    };
    res.once("close", onClose);
    // El "close" pudo pasar antes (mientras se revisaba la cuota): no se
    // repite. Es el mismo chequeo que hace el pipe del SDK.
    if (res.destroyed) onClose();
    const turn: TurnInFlight = {
      done,
      // También con el flag: "close" llega un tick después de "finish", y en
      // medio un turno que ya terminó y se está guardando se tiene que esperar.
      closed: () => closed || res.writableFinished,
      abortController,
      release: () => {
        resolve();
        if (this.turnsInFlight.get(chatId) === turn) this.turnsInFlight.delete(chatId);
      },
    };
    this.turnsInFlight.set(chatId, turn);
    return turn;
  }

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
  async deleteChat(userId: string, chatId: string): Promise<void> {
    const attachmentKeys = await this.dbService.runWithTenant(userId, async (tx) => {
      // Con la fila bloqueada: ver getChatForDelete (F10.9).
      const chat = await this.repo.getChatForDelete(tx, chatId);
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
      // F10.9: los adjuntos se van con el chat (sus filas, por el cascade).
      // Sus llaves se leen antes, para borrar los bytes después del commit.
      const keys = await this.attachments.keysByChat(tx, chatId);
      await this.repo.deleteChat(tx, chatId);
      return keys;
    });
    // Al instante, no en un barrido (decisión de Jose, F10.9): borrar el chat
    // es borrar lo que adjuntaste en él.
    await this.attachments.deleteObjects(attachmentKeys);
  }

  /**
   * Turno normal: inserta el mensaje user, carga el historial canónico
   * desde la DB (se ignora lo demás del body) y corre el pipeline del
   * agente.
   *
   * F10.8.2: si el id ya existe como el último mensaje del creator, es ese
   * turno de nuevo, no un mensaje más: "Reintentar" de un turno que se quedó
   * sin respuesta guardada (o que nunca llegó a guardarse: un corte antes de
   * que el request llegara), o "Editar" el último mensaje. Su respuesta, si
   * la hay, se borra con sus cards, igual que al regenerar.
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
    await this.afterTurnInFlight(chatId);
    // Un turno del chat que sigue respondiendo: un reenvío del mismo id no lo
    // reemplaza (sería una segunda respuesta en paralelo).
    const running = this.turnsInFlight.get(chatId);
    // Desde aquí, no desde el pipe: un corte mientras se arma el turno también
    // se tiene que esperar.
    const turn = this.trackTurn(chatId, res);
    // Cortado antes de empezar: no hay a quién responder, y no se toca nada.
    if (turn.abortController.signal.aborted) {
      turn.release();
      return;
    }
    try {
      const { history, summary, retitle } = await this.dbService
        .runWithTenant(userId, async (tx) => {
          const chat = await this.repo.getChat(tx, chatId);
          if (!chat) throw new NotFoundException("Ese chat no existe.");
          const all = await this.repo.listMessages(tx, chatId);
          let previous = all;
          let retitle = false;
          if (all.some((m) => m.id === userMessage.id)) {
            const last = lastTurnOf(all, userMessage.id);
            // Un mensaje viejo con el mismo id, o el turno sigue corriendo: un
            // reenvío por error (doble clic, reintento de la red).
            if (!last || (running && !running.closed())) {
              throw new ConflictException("Ese mensaje ya se envió.");
            }
            // F10.9: se rehace el PRIMER turno, editado o reintentado. El
            // título puede describir el texto viejo; y no basta comparar
            // textos, porque una edición que se cortó ya guardó el nuevo y su
            // reintento llega igual. Un título que no cambia es una llamada
            // utility de más, nada más.
            retitle = last.index === 0;
            await this.dropStaleReply(tx, last.staleReply);
            await this.repo.deleteMessage(tx, userMessage.id);
            previous = all.slice(0, last.index);
          }
          // Con el id del cliente (F10.8.2): web y base nombran igual al mensaje,
          // y "Regenerar" lo encuentra sin recargar la página.
          const saved = await this.repo.insertMessage(tx, {
            id: storableMessageId(userMessage),
            chatId,
            userId,
            role: "user",
            parts: userMessage.parts,
          });
          await this.repo.touchChat(tx, chatId);
          return {
            history: [...previous, saved].map((row) => toUIMessage(row)),
            summary: await this.repo.getSummary(tx, chatId),
            retitle,
          };
        })
        .catch((error: unknown) => {
          // El id choca con un mensaje que RLS no deja ver (otra cuenta).
          if (isUniqueViolation(error, "messages_pkey")) {
            throw new ConflictException("Ese mensaje ya se envió.");
          }
          throw error;
        });

      await this.runAgentTurn(
        userId,
        chatId,
        history,
        toHistorySummary(summary),
        res,
        voicePromise,
        turn,
        retitle,
      );
    } catch (error) {
      turn.release();
      throw error;
    }
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
   * Borra la respuesta vieja de un turno que se vuelve a correr, con sus cards
   * (decisión de producto, F3 PR3: no quedan huérfanas). Si alguna ya salió a
   * la red, no: borrarla dejaría un post sin card que lo represente.
   */
  private async dropStaleReply(tx: Tx, staleReply: MessageRow | undefined): Promise<void> {
    if (!staleReply) return;
    if (await this.cardsRepo.hasSentCards(tx, staleReply.id)) {
      throw new ConflictException(
        "Esta respuesta tiene publicaciones programadas o publicadas. Cancela la programación antes de regenerarla.",
      );
    }
    // Cards antes que mensaje: el FK message_id es "set null", no cascade —
    // sin este orden quedarían huérfanas en vez de borradas.
    await this.cardsRepo.deleteCardsByMessageId(tx, staleReply.id);
    await this.repo.deleteMessage(tx, staleReply.id);
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
    // "Detener" y luego "Reintentar" de inmediato: la respuesta cortada tiene
    // que estar guardada antes de leer qué se reintenta.
    await this.afterTurnInFlight(chatId);
    // Su respuesta todavía se está generando (otra pestaña): regenerar ahora
    // sería una segunda respuesta en paralelo.
    const running = this.turnsInFlight.get(chatId);
    if (running && !running.closed()) {
      throw new ConflictException("Esta respuesta todavía se está generando.");
    }
    const turn = this.trackTurn(chatId, res);
    // Cortado antes de empezar: no se borra la respuesta de un regenerar que
    // nadie va a recibir.
    if (turn.abortController.signal.aborted) {
      turn.release();
      return;
    }
    try {
      const { history, summary } = await this.dbService.runWithTenant(userId, async (tx) => {
        const chat = await this.repo.getChat(tx, chatId);
        if (!chat) throw new NotFoundException("Ese chat no existe.");
        const all = await this.repo.listMessages(tx, chatId);
        const last = lastTurnOf(all, userMessageId);
        if (!last) throw new NotFoundException("Ese mensaje no se puede reintentar.");
        await this.dropStaleReply(tx, last.staleReply);
        return {
          history: all.slice(0, last.index + 1).map((row) => toUIMessage(row)),
          summary: await this.repo.getSummary(tx, chatId),
        };
      });

      await this.runAgentTurn(
        userId,
        chatId,
        history,
        toHistorySummary(summary),
        res,
        voicePromise,
        turn,
      );
    } catch (error) {
      turn.release();
      throw error;
    }
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
    /** El turno registrado: su corte, y `release` al final de onEnd. */
    turn: TurnInFlight,
    /** F10.9: se rehízo el primer turno; el título automático se rehace. */
    retitle = false,
  ): Promise<void> {
    const { abortController, release } = turn;

    // Las cards creadas durante este turno (closure compartido con la tool):
    // onEnd las vincula al mensaje assistant una vez que existe.
    const turnCards = new TurnCards();
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
    // Un turno cortado no se cobra, pero su traza sí se guarda, con el paso a
    // medias como `aborted`. Con espera: la tool que corría al cortar todavía
    // puede terminar y entrar. Lo piden onAbort y onEnd (que corre igual,
    // fallando al leer el usage); `claim` hace que se escriba una vez.
    const guardarTrazaCortada = () => {
      trace.close("aborted");
      setTimeout(
        () => void this.aiUsage.registrarTraza(userId, chatId, trace),
        ABORTED_TRACE_GRACE_MS,
      );
    };

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
    const tools = {
      ...buildPublicationCardTools({
        userId,
        chatId,
        dbService: this.dbService,
        cardsRepository: this.cardsRepo,
        turnCards,
        groupId,
      }),
      // F10.8: la memoria entre chats. El modelo la llama cuando el creator
      // alude a otra conversación (system-prompt.ts dice cuándo); busca en
      // sus OTROS chats y, desde F10.8.1, en la parte de este que ya solo ve
      // resumida (antes de `oldestVisibleMessageId`). Nunca lanza: sin
      // memoria, el turno sigue igual.
      [MEMORY_TOOL_NAME]: tool({
        description:
          "Busca en las conversaciones anteriores del creator (otros chats) y en la parte " +
          "vieja de esta conversación que ya solo ves resumida. Úsala cuando se refiera a " +
          "algo que no ves completo aquí: de otra conversación, o un detalle de antes en " +
          "esta que el resumen no trae. Devuelve fragmentos con el título del chat, la " +
          "fecha y si son de esta misma conversación.",
        inputSchema: memorySearchInputSchema,
        execute: ({ consulta }) =>
          this.memory.search(userId, chatId, consulta, trace.runId, context.oldestVisibleMessageId),
      }),
    };

    // Voz de marca del usuario (F4): null durante el onboarding, para
    // cuentas viejas sin voz configurada, o si la carga falló — ver
    // loadVoiceForPrompt. buildSystemPrompt cae al prompt base en ese caso,
    // el chat nunca se bloquea por esto.
    const voice = await voicePromise;
    const modelMessages = await convertToModelMessages(modelHistory);

    // Cortado mientras se armaba el turno (F10.8.2): no hay a quién responder.
    // Después del último `await`: de aquí al pipe todo es síncrono, así que un
    // corte posterior ya lo escucha el pipe.
    // Ni se llama al modelo: el pipe escribiría a una conexión ya cerrada y
    // nunca llegaría a onEnd. Se guarda la respuesta vacía como `stopped`,
    // como un corte antes de la primera palabra.
    if (abortController.signal.aborted) {
      try {
        await this.persistReply(
          userId,
          chatId,
          { id: randomUUID(), role: "assistant", parts: [] },
          "stopped",
          null,
          [],
        );
      } finally {
        release();
      }
      return;
    }

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
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      abortSignal: abortController.signal,
      onStepStart: (event) => trace.stepStarted(event),
      onStepFinish: (step) => trace.stepFinished(step),
      experimental_onToolCallFinish: (event) => trace.toolFinished(event),
      // Ver guardarTrazaCortada, arriba.
      onAbort: guardarTrazaCortada,
    });

    // Una respuesta cortada o que falló sin usage (F10.8.2): se guarda lo que
    // alcanzó a escribirse, con su estado y sin cobro (no hay usage, ADR-012),
    // ni título, memoria o compactación. Una tool que corría al cortar todavía
    // puede terminar y crear su card después: el creator nunca la vio (en lo
    // guardado su tool quedó a medias), así que al vencer la misma gracia de
    // la traza se borra en vez de quedar huérfana.
    const saveInterrupted = async (responseMessage: UIMessage, status: "stopped" | "failed") => {
      // Se ligan solo las cards que la respuesta guardada muestra: una cuya
      // tool quedó a medias (el saneado la quita) no se ve en el chat, aunque
      // la card ya exista. Esas, y las que terminen de crearse después, se
      // borran al vencer la gracia.
      const visible = new Set(
        cardIdsIn([{ ...responseMessage, parts: sanitizeInterruptedParts(responseMessage.parts) }]),
      );
      const linked = turnCards.ids.filter((id) => visible.has(id));
      await this.persistReply(userId, chatId, responseMessage, status, trace.runId, linked);
      setTimeout(() => {
        void this.dropLateCards(
          userId,
          chatId,
          turnCards.ids.filter((id) => !visible.has(id)),
        );
        // F10.9: y las que lleguen después de la gracia, en cuanto lleguen.
        turnCards.close((id) => void this.dropLateCards(userId, chatId, [id]));
      }, ABORTED_TRACE_GRACE_MS);
    };

    // Promesa que se cumple cuando el stream deja de escribir. Al cortar, eso
    // pasa ANTES de onEnd (que corre desde el cancel del stream): por eso el
    // turno se da por terminado al final de onEnd, no aquí.
    // No se espera: los headers ya salieron, así que un rechazo no tiene a
    // quién responderle (el filtro de Nest intentaría mandar un 500 encima).
    // Solo se registra; el usuario ya recibió el error por `onError`.
    void result
      .pipeUIMessageStreamToResponse(res, {
        originalMessages: history,
        // El id de la respuesta viaja en el primer chunk y es con el que se
        // guarda abajo (F10.8.2): la web y la base nombran igual al mensaje.
        generateMessageId: randomUUID,
        onError: (error) => {
          console.error("Error en el stream del chat:", error);
          trace.failed(error);
          return "Algo salió mal generando la respuesta. Inténtalo de nuevo.";
        },
        onEnd: async ({ responseMessage, isAborted, finishReason }) => {
          try {
            // El SDK suelta el stream si la conexión ya no está, aunque el
            // corte se nos haya escapado: el modelo seguiría generando (y se
            // cobraría) para nadie. Se aborta y cuenta como corte. Con
            // `finishReason` el modelo ya terminó: es una respuesta completa
            // aunque la conexión se cerrara antes del final del pipe.
            const cut = !finishReason;
            if (cut && res.destroyed && !res.writableFinished) abortController.abort();
            if (isAborted || (cut && abortController.signal.aborted)) {
              guardarTrazaCortada();
              await saveInterrupted(responseMessage, "stopped");
              return;
            }

            // Se lee una sola vez, antes de guardar. Si esto falla, no hay
            // cobro: es lo que pasa cuando el creator corta
            // el turno (`isAborted` llega en false y `totalUsage` rechaza con
            // AbortError). Los tokens de ese turno quedan sin cobrar y sin fila
            // en ai_usage_events (hueco conocido, ver PR
            // feat/f45-usage-telemetry); desde F10.8.1 queda su traza, con el
            // paso cortado como `aborted`, y desde F10.8.2 la respuesta, con lo
            // que alcanzó a escribirse y su estado.
            let usage: Awaited<typeof result.totalUsage>;
            let steps: Awaited<typeof result.steps>;
            try {
              [usage, steps] = await Promise.all([result.totalUsage, result.steps]);
            } catch (error) {
              const stopped = abortController.signal.aborted;
              if (stopped) {
                guardarTrazaCortada();
              } else {
                console.error(
                  `[chat] No se pudo leer el usage del turno de chat ${chatId}:`,
                  error,
                );
                trace.close("error", error);
                void this.aiUsage.registrarTraza(userId, chatId, trace);
              }
              await saveInterrupted(responseMessage, stopped ? "stopped" : "failed");
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

            // Un error a media respuesta con usage legible: se guarda lo que
            // alcanzó a escribirse como `failed` (F10.8.2) y se cobra, como antes.
            const failed = finishReason === "error";
            // El id de la respuesta guardada; null si no se guardó.
            const savedId = await this.persistReply(
              userId,
              chatId,
              responseMessage,
              failed ? "failed" : "complete",
              trace.runId,
              turnCards.ids,
              // Cobro real con el usage real del turno, en la MISMA
              // transacción que el mensaje que cobra (modelo-de-datos.md: "o
              // se cobra y se produce, o ninguna de las dos"). charge() puede
              // dejar saldo negativo a propósito — el gate de arriba es lo
              // que evita que esto sea frecuente, no esto.
              (tx, messageId) =>
                this.creditsService.charge(tx, {
                  userId,
                  usage: chargeUsageOf(usage),
                  taskKind: "chat",
                  reason: "chat_message",
                  referenceType: "message",
                  referenceId: messageId,
                }),
            );

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
            if (savedId && !failed) {
              void this.chatTitle.maybeTitle(
                userId,
                chatId,
                [...history, responseMessage],
                trace.runId,
                retitle,
              );
              // F10.8: si el contexto de este turno ya pesa, se resume el tramo
              // viejo en segundo plano para que el siguiente viaje más ligero.
              // La respuesta de este turno también cuenta como pendiente.
              void this.compaction.maybeEnqueue(
                userId,
                chatId,
                contextTokensOf(steps),
                [...pendingAfterSummary(history, summary), responseMessage],
                trace.runId,
              );
              // F10.8: el intercambio entra a la memoria entre chats.
              void this.memory.enqueueIndex(userId, chatId, savedId, trace.runId);
            }
          } finally {
            release();
          }
        },
      })
      .catch((error: unknown) => {
        console.error("Error escribiendo el stream del chat:", error);
        // No con .finally: al cortar, el pipe se cumple ANTES de que onEnd
        // guarde la respuesta (corre desde el cancel del stream), y soltaría
        // el turno antes de tiempo. Solo si el pipe truena.
        release();
      });
  }

  /**
   * Guarda la respuesta del turno con su estado (F10.8.2) y le liga las cards
   * que el turno creó, en una transacción; `charge` cobra en esa misma. Si no
   * terminó completa, lo guardado pasa por `sanitizeInterruptedParts`:
   * vuelve a viajar al modelo. Devuelve el id guardado, o null si falló (se
   * registra; nunca lanza, corre en onEnd).
   */
  private async persistReply(
    userId: string,
    chatId: string,
    responseMessage: UIMessage,
    status: MessageStatus,
    /** null si el turno no llegó a correr: no hay traza que ligar. */
    runId: string | null,
    createdCardIds: readonly string[],
    charge?: (tx: Tx, messageId: string) => Promise<unknown>,
  ): Promise<string | null> {
    try {
      return await this.dbService.runWithTenant(userId, async (tx) => {
        const saved = await this.repo.insertMessage(tx, {
          id: responseMessage.id,
          chatId,
          userId,
          role: "assistant",
          parts:
            status === "complete"
              ? responseMessage.parts
              : sanitizeInterruptedParts(responseMessage.parts),
          runId,
          status,
        });
        await this.repo.touchChat(tx, chatId);
        await this.cardsRepo.linkCardsToMessage(tx, createdCardIds, saved.id);
        await charge?.(tx, saved.id);
        return saved.id;
      });
    } catch (error) {
      console.error(
        `[chat] No se pudo guardar la respuesta (${status}) del chat ${chatId}. ` +
          `Cards de este turno posiblemente huérfanas: ` +
          `${createdCardIds.length > 0 ? createdCardIds.join(", ") : "ninguna"}.`,
        error,
      );
      return null;
    }
  }

  /** Ver saveInterrupted en runAgentTurn. Nunca lanza: corre en un timer. */
  private async dropLateCards(userId: string, chatId: string, cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return;
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.cardsRepo.deleteUnlinkedDrafts(tx, cardIds),
      );
    } catch (error) {
      console.error(`[chat] No se pudieron borrar las cards tardías del chat ${chatId}:`, error);
    }
  }
}

/** Un turno de chat en curso (F10.8.2, ver ChatService.turnsInFlight). */
interface TurnInFlight {
  /** Se cumple cuando el turno terminó de guardarse. */
  done: Promise<void>;
  /** La conexión ya cerró: se cortó, o terminó y se está guardando. */
  closed: () => boolean;
  /** Se dispara con el corte, aunque llegue antes del pipe. */
  abortController: AbortController;
  release: () => void;
}

/** La fila de `chat_summaries` como la usa la ventana del historial. */
function toHistorySummary(row: ChatSummaryRow | undefined): HistorySummary | null {
  if (!row) return null;
  const blocks = blocksOf(row);
  // Sin un solo bloque válido no hay resumen que mandar: mejor el historial
  // completo (el techo lo acota) que un resumen vacío en lugar del tramo viejo.
  if (blocks.length === 0) {
    console.warn(`[chat] El resumen del chat ${row.chatId} no tiene bloques válidos; se ignora.`);
    return null;
  }
  return {
    blocks,
    throughMessageId: row.throughMessageId,
    cards: row.cards as CompressedCardOutput[],
  };
}
