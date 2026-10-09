import { Inject, Injectable } from "@nestjs/common";
import { generateText } from "ai";
import { AiService } from "../ai/ai.service.js";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { ChatRepository } from "./chat.repository.js";
import { toUIMessage } from "./chat-summary.js";
import { cardSummariesIn, type CompressedCardOutput } from "./context-diet.js";
import {
  SUMMARY_SYSTEM,
  boundedTramo,
  mergeCards,
  summaryPrompt,
  transcriptForSummary,
} from "./history-compaction.js";
import { KEEP_RECENT_MESSAGES, compactionCut } from "./history-window.js";

// Compactación del historial de un chat largo (F10.8).
//
// Al cerrar un turno, si su contexto pasó de CHAT_COMPACT_AT_TOKENS, se encola
// un job (`chat.compact`). El job resume con el modelo utility el tramo viejo
// —todo menos los últimos mensajes— integrando el resumen anterior, y lo
// guarda en `chat_summaries`. Desde el turno siguiente, el modelo ve ese
// resumen más lo reciente completo (history-window.ts).
//
// En un job y no dentro del turno: el creator ya tiene su respuesta, y resumir
// tarda segundos. Se cobra con la tarifa utility (decisión de Jose), y la
// compactación le ahorra cuota en cada turno siguiente.

const TASK_KIND = "history_compaction" as const;

export const COMPACTION_QUEUE = "chat.compact";
export const COMPACTION_EXPIRE_SECONDS = 5 * 60;

/**
 * Menos que esto en el tramo no vale la llamada: se espera a que haya más.
 * Alto a propósito: si los mensajes recientes ya pesan solos (cards grandes,
 * razonamiento largo), resumir de a poco no achica el contexto y cobraría
 * cada par de turnos.
 */
const MIN_MESSAGES_TO_COMPACT = 8;

/**
 * Lo que viaja en el job. Declarado como tipo y usado al encolar, no armado
 * como literal: `enqueue<T>` infiere T del literal (la cicatriz de F9.6).
 */
export interface CompactionJob {
  userId: string;
  chatId: string;
  /** F10.8.1: el turno que la disparó, para su traza. */
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
   * y hay tramo suficiente (`pendingMessages`: los que el resumen todavía no
   * cubre). Sin esto último, un chat cuyos mensajes recientes pesan solos
   * encolaría un job inútil en cada turno. Nunca lanza (`enqueue` tampoco):
   * el turno ya terminó. La cola acota a un job esperando por chat; el handler
   * es idempotente por su cuenta.
   */
  async maybeEnqueue(
    userId: string,
    chatId: string,
    contextTokens: number,
    pendingMessages: number,
    runId?: string,
  ): Promise<void> {
    if (contextTokens < env.CHAT_COMPACT_AT_TOKENS) return;
    if (pendingMessages < KEEP_RECENT_MESSAGES + MIN_MESSAGES_TO_COMPACT) return;
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
    const cut = compactionCut(pending);
    if (cut < MIN_MESSAGES_TO_COMPACT) return;
    // Con tope: un chat larguísimo se resume por tramos, un turno a la vez.
    const tramo = boundedTramo(pending.slice(0, cut));
    const last = tramo[tramo.length - 1]!;
    const lastRow = rows.find((row) => row.id === last.id)!;

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    const respuesta = await generateText({
      model: modelo.model,
      system: SUMMARY_SYSTEM,
      prompt: summaryPrompt(base?.summary ?? null, transcriptForSummary(tramo)),
    });
    const summary = respuesta.text.trim();

    if (summary) {
      const cards = mergeCards(
        (base?.cards ?? []) as CompressedCardOutput[],
        cardSummariesIn(tramo),
      );
      await this.dbService.runWithTenant(userId, async (tx) => {
        const saved = await this.repo.saveSummary(tx, {
          chatId,
          userId,
          summary,
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
          usage: chargeUsageOf(respuesta.usage),
          taskKind: TASK_KIND,
          reason: "history_compaction",
          referenceType: "message",
          referenceId: last.id,
        });
      });
    }

    // Siempre que hubo llamada: los tokens se pagaron aunque no se guardara.
    await this.aiUsage.registrar({
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
      },
    });
  }
}
