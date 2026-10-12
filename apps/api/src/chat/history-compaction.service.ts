import { Inject, Injectable } from "@nestjs/common";
import { generateText, type UIMessage } from "ai";
import { AiService } from "../ai/ai.service.js";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, type ChatTurnUsage } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { ChatRepository } from "./chat.repository.js";
import { toUIMessage } from "./chat-summary.js";
import { cardSummariesIn, type CompressedCardOutput } from "./context-diet.js";
import {
  CONSOLIDATE_AT_TOKENS,
  CONSOLIDATE_SYSTEM,
  SUMMARY_SYSTEM,
  blocksOf,
  blocksTokens,
  boundedTramo,
  consolidatePrompt,
  mergeCards,
  summaryPrompt,
  transcriptForSummary,
  type SummaryBlock,
} from "./history-compaction.js";
import { compactableCut } from "./history-window.js";
import { markUnansweredTurns } from "./unanswered-turns.js";

// Compactación del historial de un chat largo (F10.8).
//
// Al cerrar un turno, si su contexto pasó de CHAT_COMPACT_AT_TOKENS, se encola
// un job (`chat.compact`). El job resume con el modelo utility el tramo viejo
// —todo menos lo reciente— y AGREGA ese resumen como un bloque nuevo en
// `chat_summaries` (F10.8.1: los bloques anteriores van de referencia, no se
// reescriben). Desde el turno siguiente, el modelo ve los bloques más lo
// reciente completo (history-window.ts).
//
// Si dos jobs del mismo chat se cruzan (no debería: `singletonKey` por chat),
// el que pierde en `saveSummary` pagó sus llamadas sin asiento; queda en
// ai_usage_events.
//
// En un job y no dentro del turno: el creator ya tiene su respuesta, y resumir
// tarda segundos. Se cobra con la tarifa utility (decisión de Jose), y la
// compactación le ahorra cuota en cada turno siguiente.

const TASK_KIND = "history_compaction" as const;

export const COMPACTION_QUEUE = "chat.compact";
export const COMPACTION_EXPIRE_SECONDS = 5 * 60;

/**
 * Lo que viaja en el job. Declarado como tipo y usado al encolar, no armado
 * como literal: `enqueue<T>` infiere T del literal (la cicatriz de F9.6).
 */
export interface CompactionJob {
  userId: string;
  chatId: string;
  /**
   * F10.8.1: el turno que la encoló, para su traza. Con `singletonKey` por
   * chat, si otro turno la pide mientras espera, se queda la del primero: la
   * compactación se atribuye al turno que la disparó, no al último que la
   * habría pedido.
   */
  runId?: string;
}

@Injectable()
export class HistoryCompactionService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BossService) private readonly boss: BossService,
  ) {}

  /**
   * Al cerrar un turno: encola la compactación si el contexto pasó del umbral
   * y hay tramo que valga resumir en `pending` (lo que el resumen todavía no
   * cubre), con la misma regla que aplica el job (`compactableCut`). Sin esto
   * último, un chat cuyos mensajes recientes pesan solos encolaría un job
   * inútil en cada turno. Nunca lanza (`enqueue` tampoco):
   * el turno ya terminó. La cola acota a un job esperando por chat; el handler
   * es idempotente por su cuenta.
   */
  async maybeEnqueue(
    userId: string,
    chatId: string,
    contextTokens: number,
    pending: UIMessage[],
    runId?: string,
  ): Promise<void> {
    if (contextTokens < env.CHAT_COMPACT_AT_TOKENS) return;
    if (compactableCut(pending) === 0) return;
    const job: CompactionJob = { userId, chatId, runId };
    await this.boss.enqueue(COMPACTION_QUEUE, job, {
      singletonKey: chatId,
      expireInSeconds: COMPACTION_EXPIRE_SECONDS,
    });
  }

  /**
   * El handler del job. Idempotente: relee el chat y el resumen, y si el tramo
   * pendiente es corto (otro job ya lo resumió) no hace nada.
   */
  async compact({ userId, chatId, runId }: CompactionJob): Promise<void> {
    const { rows, previous } = await this.dbService.runWithTenant(userId, async (tx) => ({
      rows: await this.repo.listMessages(tx, chatId),
      previous: await this.repo.getSummary(tx, chatId),
    }));
    const history = rows.map(toUIMessage);

    // Lo que el resumen anterior todavía no cubre. Si su último mensaje ya no
    // está (no debería pasar: el tramo resumido no se borra), se sigue desde
    // su fecha, con el mismo resumen como base, y queda en el log. Empezar de
    // cero no serviría: saveSummary solo guarda un resumen que llega más lejos
    // que el anterior, y el primer tramo casi nunca llega, así que cada turno
    // pagaría un resumen que se tira.
    let after = previous ? history.findIndex((m) => m.id === previous.throughMessageId) : -1;
    if (previous && after === -1) {
      console.warn(
        `[chat] El resumen del chat ${chatId} apunta a un mensaje que ya no existe (${previous.throughMessageId}); se sigue desde su fecha.`,
      );
      while (after + 1 < rows.length && rows[after + 1]!.createdAt <= previous.throughCreatedAt) {
        after++;
      }
    }
    const base = previous;
    const pending = history.slice(after + 1);
    const cut = compactableCut(pending);
    if (cut === 0) return;
    // Con tope: un chat larguísimo se resume por tramos, un turno a la vez.
    const tramo = boundedTramo(pending.slice(0, cut));
    const last = tramo[tramo.length - 1]!;
    const lastRow = rows.find((row) => row.id === last.id)!;

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const anteriores = base ? blocksOf(base) : [];
    const arranque = Date.now();
    // Solo lo nuevo de este tramo: los bloques anteriores van de referencia y
    // no se reescriben (F10.8.1).
    const respuesta = await generateText({
      model: modelo.model,
      system: SUMMARY_SYSTEM,
      // Con los turnos sin respuesta marcados (F10.8.2), como los ve el modelo:
      // sin la marca, el resumen daría por contestado un pedido que se cortó.
      prompt: summaryPrompt(anteriores, transcriptForSummary(markUnansweredTurns(tramo))),
    });
    await this.registrar(userId, chatId, modelo, respuesta, arranque, runId, false);
    const summary = respuesta.text.trim();
    if (!summary) return;

    const ahora = new Date().toISOString();
    let blocks: SummaryBlock[] = [
      ...anteriores,
      {
        summary,
        throughMessageId: last.id,
        throughCreatedAt: lastRow.createdAt.toISOString(),
        model: modelo.id,
        createdAt: ahora,
      },
    ];
    let cobro = chargeUsageOf(respuesta.usage);

    // Si los bloques ya pesan demasiado, se funden en uno. Es la única vez que
    // el prefijo de resúmenes cambia entero; se cobra junto con el resumen.
    // Con un solo bloque no hay nada que fundir (sería pagar por reescribirlo).
    // Si la consolidación falla, se guardan los bloques sin consolidar: el
    // resumen ya está pagado, y se reintenta en la siguiente compactación.
    if (blocks.length >= 2 && blocksTokens(blocks) > CONSOLIDATE_AT_TOKENS) {
      const arranqueConsolidacion = Date.now();
      try {
        const consolidacion = await generateText({
          model: modelo.model,
          system: CONSOLIDATE_SYSTEM,
          prompt: consolidatePrompt(blocks),
        });
        await this.registrar(
          userId,
          chatId,
          modelo,
          consolidacion,
          arranqueConsolidacion,
          runId,
          true,
        );
        // Se pagó aunque no devuelva texto: entra al asiento igual.
        cobro = sumarCobro(cobro, chargeUsageOf(consolidacion.usage));
        const juntos = consolidacion.text.trim();
        if (juntos) blocks = [{ ...blocks[blocks.length - 1]!, summary: juntos }];
      } catch (error) {
        console.error(
          `[chat] No se pudieron consolidar los bloques del chat ${chatId}; se guardan sin consolidar:`,
          error,
        );
      }
    }

    const cards = mergeCards((base?.cards ?? []) as CompressedCardOutput[], cardSummariesIn(tramo));
    await this.dbService.runWithTenant(userId, async (tx) => {
      const saved = await this.repo.saveSummary(tx, {
        chatId,
        userId,
        blocks,
        throughMessageId: last.id,
        throughCreatedAt: lastRow.createdAt,
        cards,
        model: modelo.id,
      });
      // Otro job ya guardó uno que llega igual o más lejos: este no cuenta.
      if (!saved) return;
      // En la MISMA transacción que el resumen que cobra. Cada compactación
      // es un asiento: la referencia es el último mensaje que cubre.
      await this.credits.charge(tx, {
        userId,
        usage: cobro,
        taskKind: TASK_KIND,
        reason: "history_compaction",
        referenceType: "message",
        referenceId: last.id,
      });
    });
  }

  /** Cada llamada deja su fila de uso, aunque el resumen no se guarde: los tokens se pagaron. */
  private registrar(
    userId: string,
    chatId: string,
    modelo: ReturnType<AiService["resolveForTask"]>,
    respuesta: Awaited<ReturnType<typeof generateText>>,
    arranque: number,
    runId: string | undefined,
    consolidacion: boolean,
  ): Promise<void> {
    return this.aiUsage.registrar({
      userId,
      chatId,
      task: TASK_KIND,
      modelo,
      usage: respuesta.usage,
      stepsCount: 1,
      arranque,
      runId,
      providerRaw: {
        usage: respuesta.usage,
        finishReason: respuesta.finishReason,
        providerMetadata: respuesta.providerMetadata,
        ...(consolidacion ? { consolidacion: true } : {}),
      },
    });
  }
}

/** Dos llamadas, un asiento: se suman sus tokens. */
function sumarCobro(a: ChatTurnUsage, b: ChatTurnUsage): ChatTurnUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens:
      a.cachedInputTokens === null && b.cachedInputTokens === null
        ? null
        : (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0),
    reasoningTokens:
      a.reasoningTokens == null && b.reasoningTokens == null
        ? null
        : (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
  };
}
