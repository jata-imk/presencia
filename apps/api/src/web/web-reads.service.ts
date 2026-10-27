import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ReadLinkOutput } from "@presencia/shared";
import { DbService } from "../db/db.service.js";
import { estimateTextTokens } from "../attachments/attachment-content.js";
import { readPage, type PageRead } from "./read-page.js";
import { failedOutput, outputOf } from "./read-output.js";
import { normalizeReadUrl } from "./read-url.js";
import { WebReadsRepository, type WebReadRow } from "./web-reads.repository.js";

// F10.10 (ADR-028): leer un enlace desde el chat. Pide la página (o la saca
// del caché), la guarda en `web_reads` y devuelve la referencia que se queda en
// la parte del mensaje. El texto para el modelo lo arma read-link.tool.ts: de
// la fila del turno, o de lo que la dieta de contexto (web-read-context.ts)
// dejó en la parte en los turnos siguientes.

@Injectable()
export class WebReadsService {
  private readonly logger = new Logger(WebReadsService.name);

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(WebReadsRepository) private readonly repo: WebReadsRepository,
  ) {}

  /**
   * Nunca lanza por la página: todo lo que salga mal es un `estado`. Sí lanza
   * si el turno se cortó mientras se leía: no hay a quién contestarle, y una
   * fila `no_disponible` por cada Detener ensuciaría la cuenta de sitios caídos.
   */
  async read(
    userId: string,
    chatId: string,
    rawUrl: string,
    signal?: AbortSignal,
  ): Promise<{ output: ReadLinkOutput; row: WebReadRow | null }> {
    const url = normalizeReadUrl(rawUrl);
    if (!url) return { output: failedOutput(rawUrl, "no_encontrada"), row: null };

    const cached = await this.db.runWithTenant(userId, (tx) =>
      this.repo.findCached(tx, chatId, url),
    );
    if (cached?.chatId === chatId) return { output: outputOf(cached), row: cached };
    if (cached) {
      // De otro chat: se copia a este, para que muera con él (cascade) y la
      // referencia de la parte apunte a una fila de esta conversación. Con la
      // fecha de la original: la copia no es una descarga nueva, y si no, una
      // página se podría servir de copia en copia sin volver a pedirse nunca.
      const row = await this.db.runWithTenant(userId, (tx) =>
        this.repo.insert(tx, {
          userId,
          chatId,
          url: cached.url,
          finalUrl: cached.finalUrl,
          status: cached.status,
          title: cached.title,
          siteName: cached.siteName,
          extractedText: cached.extractedText,
          truncated: cached.truncated,
          onlyDescription: cached.onlyDescription,
          tokenEstimate: cached.tokenEstimate,
          // La descripción también sirve: es de la misma página.
          description: cached.description,
          describedAt: cached.describedAt,
          createdAt: cached.createdAt,
        }),
      );
      return { output: outputOf(row), row };
    }

    const page = await readPage(url, { signal });
    signal?.throwIfAborted();
    if (page.status !== "ok") {
      this.logger.log(`[leer_enlace] ${page.status} ${url}: ${page.detail}`);
    }
    const row = await this.db.runWithTenant(userId, (tx) =>
      this.repo.insert(tx, { userId, chatId, ...rowOf(page) }),
    );
    return { output: outputOf(row), row };
  }

  /** La fila de una referencia guardada. null si ya no existe o si la base falló. */
  async findById(userId: string, readId: string): Promise<WebReadRow | null> {
    try {
      return (await this.db.runWithTenant(userId, (tx) => this.repo.findById(tx, readId))) ?? null;
    } catch (error) {
      this.logger.warn(`[leer_enlace] no se pudo cargar ${readId}: ${String(error)}`);
      return null;
    }
  }

  /**
   * Las lecturas que cita la ventana del chat, de una sola vez (como
   * `attachments.forContext`). `null` si la lectura falló: el turno sigue,
   * con cada página nombrada y sin su texto.
   */
  async forContext(
    userId: string,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, WebReadRow> | null> {
    if (ids.length === 0) return new Map();
    try {
      const rows = await this.db.runWithTenant(userId, (tx) => this.repo.findByIds(tx, ids));
      return new Map(rows.map((row) => [row.id, row]));
    } catch (error) {
      this.logger.warn(`[leer_enlace] no se pudieron cargar las lecturas: ${String(error)}`);
      return null;
    }
  }
}

function rowOf(page: PageRead) {
  if (page.status !== "ok") {
    return { url: page.url, finalUrl: page.finalUrl, status: page.status };
  }
  return {
    url: page.url,
    finalUrl: page.finalUrl,
    status: page.status,
    title: page.title,
    siteName: page.siteName,
    extractedText: page.text,
    truncated: page.truncated,
    onlyDescription: page.onlyDescription,
    tokenEstimate: estimateTextTokens(page.text),
  };
}
