import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { WebSearchOutput } from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { DbService } from "../db/db.service.js";
import { SEARCH_PROVIDER, type SearchProvider } from "./search-provider.js";

// F10.10 (ADR-028): una búsqueda del chat. Pregunta al buscador, cobra la
// búsqueda (tarifa fija, `flat.web_search`) y deja su fila de gasto. Los
// resultados no se guardan aparte: son chicos y van completos en la parte del
// mensaje.

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
  ) {}

  /**
   * Nunca lanza por el buscador: si falla, `no_disponible` y el modelo lo
   * dice. Sí lanza si el turno se cortó mientras buscaba (no hay a quién
   * contestarle).
   */
  async search(
    userId: string,
    chatId: string,
    consulta: string,
    runId: string | null,
    signal?: AbortSignal,
  ): Promise<WebSearchOutput> {
    const arranque = Date.now();
    let resultados;
    try {
      resultados = await this.provider.search(consulta, signal);
    } catch (error) {
      signal?.throwIfAborted();
      this.logger.warn(`[buscar_en_web] ${this.provider.provider} falló: ${String(error)}`);
      return { searchId: null, consulta, estado: "no_disponible", resultados: [] };
    }

    // La búsqueda ya se pagó al buscador: se cobra aunque no traiga nada o el
    // turno se corte después (costo ya incurrido, como una imagen).
    const searchId = randomUUID();
    try {
      await this.db.runWithTenant(userId, (tx) =>
        this.credits.spend(tx, {
          userId,
          reason: "web_search",
          referenceType: "web_search",
          referenceId: searchId,
          allowOverdraft: true,
        }),
      );
    } catch (error) {
      // Sin cobro el creator no pierde nada; sin resultados sí. Se registra y
      // se sigue: la fila de gasto de abajo deja la búsqueda a la vista.
      this.logger.error(`[buscar_en_web] No se cobró la búsqueda ${searchId}:`, error);
    }
    await this.aiUsage.registrar({
      userId,
      chatId,
      task: "web_search",
      modelo: { provider: this.provider.provider, modelName: this.provider.model },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      stepsCount: 1,
      arranque,
      searchQueries: 1,
      runId,
      providerRaw: { resultados: resultados.length },
    });
    return {
      searchId,
      consulta,
      estado: resultados.length > 0 ? "ok" : "sin_resultados",
      resultados,
    };
  }
}
