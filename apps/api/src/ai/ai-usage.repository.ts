import { Injectable } from "@nestjs/common";
import { aiUsageEvents } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";
import type { AiTaskKind } from "./provider-registry.js";

// Todo acceso a ai_usage_events vive aquí (patrón de ChatRepository /
// CardsRepository). Las queries no filtran por user_id: el RLS de la
// transacción es el filtro. La tabla es append-only (0006_rls_ai_usage_events
// revoca UPDATE/DELETE al rol de la API) — este repository nunca ofrece un
// método de actualización o borrado a propósito.

export type AiUsageEventRow = typeof aiUsageEvents.$inferSelect;

export interface InsertAiUsageEventInput {
  userId: string;
  chatId: string | null;
  taskKind: AiTaskKind;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number | null;
  stepsCount: number;
  durationMs: number;
  // Crudo del proveedor (usage + providerMetadata por step, finishReason).
  // Nunca se normaliza aquí — esa lectura es trabajo de F5.
  providerRaw: unknown;
}

@Injectable()
export class AiUsageRepository {
  async insertEvent(tx: Tx, input: InsertAiUsageEventInput): Promise<AiUsageEventRow> {
    const [event] = await tx.insert(aiUsageEvents).values(input).returning();
    if (!event) throw new Error("No se pudo registrar el evento de usage");
    return event;
  }
}
