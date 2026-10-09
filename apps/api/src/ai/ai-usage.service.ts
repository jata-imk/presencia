import { Inject, Injectable } from "@nestjs/common";
import type { ImageModelUsage, LanguageModelUsage } from "ai";
import { DbService } from "../db/db.service.js";
import { AiUsageRepository } from "./ai-usage.repository.js";
import type { ResolvedModel } from "./ai.service.js";
import type { AiTaskKind } from "./provider-registry.js";
import type { RunTrace } from "./run-trace.js";

/** Lo que cada llamador sabe de su llamada. El resto lo arma `registrar`. */
export interface RegistroDeUso {
  userId: string;
  /** Solo el chat tiene uno; el resto de las tareas no viven en una conversación. */
  chatId?: string | null;
  task: AiTaskKind;
  /**
   * El modelo que DE VERDAD corrió: la identidad sale del mismo `ResolvedModel`
   * o, en las imágenes, del `ImageProvider` que dibujó (F10).
   */
  modelo: {
    provider: string;
    modelName: ResolvedModel["modelName"];
    /** F10.7: los trae un `ResolvedModel` de texto; un generador de imagen todavía no. */
    fallbackFrom?: ResolvedModel["fallbackFrom"];
    attempts?: ResolvedModel["attempts"];
  };
  /**
   * El usage de un modelo de texto, o el de uno de imagen, que solo trae
   * tokens de entrada y salida (y a veces ni eso: sin dato cuenta como 0).
   */
  usage: LanguageModelUsage | ImageModelUsage;
  /** Llamadas reales al proveedor dentro de la tarea (tool calls incluidos). */
  stepsCount: number;
  /** `Date.now()` de antes de la llamada. */
  arranque: number;
  /** Solo la búsqueda con grounding. `null` es "esta llamada no busca", no "cero". */
  searchQueries?: number | null;
  /** Solo las tareas de imagen. `null` es "esta llamada no dibuja", no "cero". */
  imagesCount?: number | null;
  /** Crudo del proveedor, sin normalizar. */
  providerRaw: unknown;
  /**
   * F10.8.1: el turno de chat al que pertenece la llamada (el turno, la
   * búsqueda de memoria dentro de él, o un job que disparó). Sin él, la fila
   * queda suelta, como todo lo que no nace de un turno.
   */
  runId?: string | null;
}

// El único punto por el que una llamada al modelo deja su fila en
// `ai_usage_events` (F9.8). Antes cada llamador armaba la fila a mano, y
// olvidarlo no fallaba en ningún lado: así fue como las tendencias pasaron dos
// fases sin dejar rastro en la tabla con la que se calibra el rate card.
//
// Nunca lanza. Registrar es telemetría: un fallo acá no puede costarle al
// usuario el mensaje, la narración o la tanda que ya se produjeron.
@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiUsageRepository) private readonly repo: AiUsageRepository,
  ) {}

  /**
   * `trace` (F10.8.1): la traza del turno, en la misma transacción que su fila
   * de uso: un turno terminado no paga un viaje extra a la base por ella.
   */
  async registrar(registro: RegistroDeUso, trace?: RunTrace): Promise<void> {
    const { userId, task, modelo, usage } = registro;
    try {
      await this.dbService.runWithTenant(userId, async (tx) => {
        if (trace?.claim()) {
          await this.repo.insertRunSteps(tx, stepRows(trace, userId, registro.chatId ?? null));
        }
        await this.repo.insertEvent(tx, {
          userId,
          chatId: registro.chatId ?? null,
          taskKind: task,
          provider: modelo.provider,
          model: modelo.modelName,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cachedInputTokens:
            "inputTokenDetails" in usage ? (usage.inputTokenDetails.cacheReadTokens ?? null) : null,
          stepsCount: registro.stepsCount,
          durationMs: Date.now() - registro.arranque,
          searchQueries: registro.searchQueries ?? null,
          imagesCount: registro.imagesCount ?? null,
          fallbackFrom: modelo.fallbackFrom ?? null,
          runId: registro.runId ?? null,
          // Los intentos que fallaron viajan con el crudo: son el porqué del
          // respaldo, y solo importan cuando se investiga uno.
          providerRaw:
            modelo.attempts && modelo.attempts.length > 0
              ? withAttempts(registro.providerRaw, modelo.attempts)
              : registro.providerRaw,
        });
      });
    } catch (error) {
      console.error(`[ai] No se pudo registrar el usage de ${task} para ${userId}:`, error);
    }
  }

  /**
   * F10.8.1: guarda la traza de un turno que NO terminó (cortado, o sin
   * usage que registrar); la de un turno terminado viaja con `registrar`.
   * Una sola vez aunque se pida dos (`RunTrace.claim`). Nunca lanza: una
   * traza perdida no puede costar nada al creator.
   */
  async registrarTraza(userId: string, chatId: string | null, trace: RunTrace): Promise<void> {
    if (!trace.claim()) return;
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.insertRunSteps(tx, stepRows(trace, userId, chatId)),
      );
    } catch (error) {
      console.error(`[ai] No se pudo guardar la traza ${trace.runId} de ${userId}:`, error);
    }
  }
}

/** Los pasos de una traza como filas de ai_run_steps. */
function stepRows(trace: RunTrace, userId: string, chatId: string | null) {
  return trace.steps.map((step) => ({ ...step, runId: trace.runId, userId, chatId }));
}

/** Los intentos fallidos junto al crudo, sin aplanar un crudo que no es objeto. */
function withAttempts(raw: unknown, attempts: NonNullable<RegistroDeUso["modelo"]["attempts"]>) {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? { ...raw, attempts }
    : { raw, attempts };
}
