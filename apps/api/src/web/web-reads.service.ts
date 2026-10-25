import { Inject, Injectable, Logger } from "@nestjs/common";
import { normalizeTrendSource, type ReadLinkOutput } from "@presencia/shared";
import { DbService } from "../db/db.service.js";
import { estimateTextTokens } from "../attachments/attachment-content.js";
import { readPage, type PageRead } from "./read-page.js";
import { normalizeReadUrl } from "./read-url.js";
import { WebReadsRepository, type WebReadRow } from "./web-reads.repository.js";

// F10.10 (ADR-028): leer un enlace desde el chat. Pide la página (o la saca
// del caché), la guarda en `web_reads` y devuelve la referencia que se queda en
// la parte del mensaje. El texto para el modelo lo arma read-link.tool.ts, de
// la fila del turno o de `findById` en los siguientes.

export function outputOf(row: WebReadRow): ReadLinkOutput {
  return {
    readId: row.id,
    url: row.url,
    urlFinal: row.finalUrl,
    titulo: row.title,
    dominio: normalizeTrendSource(row.finalUrl ?? row.url),
    estado: row.status,
    truncado: row.truncated,
    soloDescripcion: row.onlyDescription,
  };
}

@Injectable()
export class WebReadsService {
  private readonly logger = new Logger(WebReadsService.name);

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(WebReadsRepository) private readonly repo: WebReadsRepository,
  ) {}

  /** Nunca lanza por la página: todo lo que salga mal es un `estado`. */
  async read(
    userId: string,
    chatId: string,
    rawUrl: string,
    signal?: AbortSignal,
  ): Promise<{ output: ReadLinkOutput; row: WebReadRow | null }> {
    const url = normalizeReadUrl(rawUrl);
    if (!url) {
      return {
        output: {
          readId: null,
          url: rawUrl,
          urlFinal: null,
          titulo: null,
          dominio: null,
          estado: "no_encontrada",
          truncado: false,
          soloDescripcion: false,
        },
        row: null,
      };
    }

    const cached = await this.db.runWithTenant(userId, (tx) =>
      this.repo.findCached(tx, chatId, url),
    );
    if (cached?.chatId === chatId) return { output: outputOf(cached), row: cached };
    if (cached) {
      // De otro chat: se copia a este, para que muera con él (cascade) y la
      // referencia de la parte apunte a una fila de esta conversación.
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
        }),
      );
      return { output: outputOf(row), row };
    }

    const page = await readPage(url, { signal });
    if (page.status !== "ok") {
      this.logger.log(`[leer_enlace] ${page.status} ${url}: ${page.detail}`);
    }
    const row = await this.db.runWithTenant(userId, (tx) =>
      this.repo.insert(tx, { userId, chatId, ...rowOf(page) }),
    );
    return { output: outputOf(row), row };
  }

  /** La fila de una referencia guardada (turnos posteriores). null si ya no existe. */
  async findById(userId: string, readId: string): Promise<WebReadRow | null> {
    try {
      return (await this.db.runWithTenant(userId, (tx) => this.repo.findById(tx, readId))) ?? null;
    } catch (error) {
      this.logger.warn(`[leer_enlace] no se pudo cargar ${readId}: ${String(error)}`);
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
