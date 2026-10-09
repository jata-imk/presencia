import { Inject, Injectable } from "@nestjs/common";
import { embed } from "ai";
import type { MemorySearchOutput } from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import {
  DEFAULT_EMBEDDING_MODEL_ID,
  createEmbeddingModelResolver,
  parseModelId,
} from "../ai/provider-registry.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { BossService } from "../jobs/boss.service.js";
import { toUIMessage } from "./chat-summary.js";
import { ChatRepository } from "./chat.repository.js";
import {
  MEMORY_RESULTS,
  MIN_SIMILARITY,
  embeddingOptions,
  estimateEmbeddingTokens,
  exchangeText,
} from "./memory.js";

// Memoria entre chats (F10.8, decisión de Jose: con embeddings).
//
// - Indexar: al cerrar cada turno se encola `memory.index`, que convierte el
//   intercambio (mensaje del creator + respuesta) en un embedding de
//   documento y lo guarda en `memory_chunks`.
// - Buscar: el chat llama la tool `buscar_en_memoria` cuando el creator alude
//   a otra conversación; se busca por significado en sus OTROS chats.
//
// Ninguna de las dos se cobra: un intercambio son ~500 tokens de un modelo de
// $0.15/M, menos de una unidad. Las dos quedan en `ai_usage_events`.

export const MEMORY_INDEX_QUEUE = "memory.index";
export const MEMORY_INDEX_EXPIRE_SECONDS = 2 * 60;

/**
 * Lo que viaja en el job. Declarado como tipo y usado al encolar, no armado
 * como literal: `enqueue<T>` infiere T del literal (la cicatriz de F9.6).
 */
export interface MemoryIndexJob {
  userId: string;
  chatId: string;
  /** La respuesta del intercambio (assistant). */
  messageId: string;
  /** F10.8.1: el turno que la produjo, para su traza. */
  runId?: string;
}

@Injectable()
export class MemoryService {
  private readonly modelId = env.AI_MODEL_EMBEDDING ?? DEFAULT_EMBEDDING_MODEL_ID;
  private readonly resolve = createEmbeddingModelResolver(process.env);

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(BossService) private readonly boss: BossService,
  ) {}

  /** Al cerrar un turno guardado. Nunca lanza (`enqueue` tampoco). */
  async enqueueIndex(
    userId: string,
    chatId: string,
    messageId: string,
    runId?: string,
  ): Promise<void> {
    const job: MemoryIndexJob = { userId, chatId, messageId, runId };
    await this.boss.enqueue(MEMORY_INDEX_QUEUE, job, {
      singletonKey: messageId,
      expireInSeconds: MEMORY_INDEX_EXPIRE_SECONDS,
    });
  }

  /**
   * El handler del job. Idempotente: si el intercambio ya tiene fragmento, o
   * la respuesta ya no existe (se reintentó), no hace nada.
   */
  async index({ userId, chatId, messageId, runId }: MemoryIndexJob): Promise<void> {
    const { exchange, done } = await this.dbService.runWithTenant(userId, async (tx) => ({
      exchange: await this.repo.findExchange(tx, chatId, messageId),
      done: await this.repo.hasMemoryChunk(tx, messageId),
    }));
    if (done || !exchange || exchange.reply.role !== "assistant") return;
    const { reply, previous } = exchange;
    const content = exchangeText(
      previous?.role === "user" ? toUIMessage(previous) : undefined,
      toUIMessage(reply),
    );
    if (!content) return;

    const vector = await this.embed(userId, chatId, content, "document", runId);
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.insertMemoryChunk(tx, {
          userId,
          chatId,
          messageId,
          content,
          embedding: vector,
          model: this.modelId,
        }),
      );
    } catch (error) {
      // La respuesta se borró mientras se calculaba el embedding (el creator
      // regeneró o borró el chat): ya no hay intercambio que recordar.
      if (isForeignKeyViolation(error)) return;
      throw error;
    }
  }

  /**
   * La tool: los recuerdos más parecidos a `consulta` en los otros chats del
   * usuario. Nunca lanza: una memoria que no respondió deja al chat seguir
   * sin ella, no tumba el turno.
   */
  async search(
    userId: string,
    chatId: string,
    consulta: string,
    runId?: string,
  ): Promise<MemorySearchOutput> {
    try {
      const vector = await this.embed(userId, chatId, consulta, "query", runId);
      const rows = await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.searchMemory(tx, {
          chatId,
          model: this.modelId,
          embedding: vector,
          limit: MEMORY_RESULTS,
        }),
      );
      return {
        resultados: rows
          .filter((row) => row.similarity >= MIN_SIMILARITY)
          .map((row) => ({
            fragmento: row.content,
            chat: row.chatTitle,
            fecha: row.createdAt.toISOString(),
          })),
      };
    } catch (error) {
      console.error(`[memoria] No se pudo buscar en la memoria del chat ${chatId}:`, error);
      return { resultados: [] };
    }
  }

  /** Un embedding, con su fila en `ai_usage_events` (tokens estimados si el proveedor no los da). */
  private async embed(
    userId: string,
    chatId: string,
    value: string,
    role: "document" | "query",
    runId?: string,
  ): Promise<number[]> {
    const { provider, model } = parseModelId(this.modelId);
    const arranque = Date.now();
    const result = await embed({
      model: this.resolve(this.modelId),
      value,
      providerOptions: embeddingOptions(provider, role),
    });
    const tokens = Number.isFinite(result.usage?.tokens)
      ? result.usage.tokens
      : estimateEmbeddingTokens(value);
    await this.aiUsage.registrar({
      userId,
      chatId,
      task: role === "document" ? "memory_index" : "memory_search",
      modelo: { provider, modelName: model },
      usage: { inputTokens: tokens, outputTokens: 0, totalTokens: tokens },
      stepsCount: 1,
      arranque,
      runId,
      providerRaw: {
        usage: result.usage ?? null,
        estimado: !Number.isFinite(result.usage?.tokens),
      },
    });
    return result.embedding;
  }
}

/** SQLSTATE 23503: la fila a la que apunta la FK ya no existe. Drizzle lo envuelve en `cause`. */
function isForeignKeyViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return cause?.code === "23503";
}
