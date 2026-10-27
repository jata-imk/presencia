import { Inject, Injectable } from "@nestjs/common";
import { generateText } from "ai";
import { AiService } from "../ai/ai.service.js";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { cleanDescription, sliceText } from "../attachments/attachment-digest.js";
import { insideTag, safeName } from "../chat/attachment-context.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { BossService } from "../jobs/boss.service.js";
import { PAGE_DIGEST_SYSTEM } from "./web-read-digest.js";
import { WebReadsRepository, type WebReadRow } from "./web-reads.repository.js";

// La descripción de cada página leída (F10.10, ADR-028). Cuando una página
// sale de la ventana de recientes (chat/web-read-context.ts) viaja como una
// línea con esto, en vez de su texto. Es la misma tarea que la de los adjuntos
// (`content_digest`, attachment-digest.service.ts), con un prompt para
// páginas, su propia cola y el mismo cobro (ADR-012).
//
// Se pide solo para las páginas que con un turno más dejarían de viajar
// completas (webReadIdsToDescribe; ChatService.runAgentTurn las encola): una
// que sigue completa hasta que el chat termina o se resume no se describe
// nunca, porque nadie la va a ver como línea.

export const WEB_READ_DIGEST_QUEUE = "web_read.describe";
export const WEB_READ_DIGEST_EXPIRE_SECONDS = 2 * 60;

export interface WebReadDigestJob {
  userId: string;
  readId: string;
  chatId: string;
  runId?: string;
}

const TASK_KIND = "content_digest" as const;

/** Cuánto texto de la página lee quien la describe: el principio alcanza. */
const DIGEST_SOURCE_CHARS = 20_000;

@Injectable()
export class WebReadDigestService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(WebReadsRepository) private readonly repo: WebReadsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BossService) private readonly boss: BossService,
  ) {}

  /** Encola la descripción de estas lecturas. Nunca lanza. */
  async enqueue(
    userId: string,
    chatId: string,
    readIds: readonly string[],
    runId?: string,
  ): Promise<void> {
    await Promise.all(
      readIds.map(async (readId) => {
        const job: WebReadDigestJob = { userId, readId, chatId, runId };
        try {
          await this.boss.enqueue(WEB_READ_DIGEST_QUEUE, job, {
            singletonKey: readId,
            expireInSeconds: WEB_READ_DIGEST_EXPIRE_SECONDS,
          });
        } catch (error) {
          // Sin descripción, la página vieja viaja como su título y su
          // dominio; el siguiente turno la vuelve a pedir.
          console.error(`[leer_enlace] No se encoló la descripción de ${readId}:`, error);
        }
      }),
    );
  }

  /**
   * El handler del job, con las mismas reglas que el de los adjuntos:
   * idempotente (una con descripción no vuelve a llamar ni a cobrar), anota
   * el intento si falla y lanza para que pg-boss reintente, y la llamada que
   * se pagó queda en ai_usage_events aunque lo de después falle.
   */
  async describe(job: WebReadDigestJob): Promise<void> {
    const { userId, readId, chatId, runId } = job;
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, readId));
    if (!row || row.description !== null || row.status !== "ok" || !row.extractedText) return;

    // La misma página ya descrita en otra lectura del creator (la copia de
    // caché se hizo antes de que la original tuviera descripción): se copia,
    // sin llamar al modelo ni cobrar otra vez.
    const twin = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findDescribedTwin(tx, row),
    );
    if (twin) {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.setDescription(tx, readId, twin),
      );
      return;
    }

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    let respuesta;
    try {
      respuesta = await generateText({
        model: modelo.model,
        system: PAGE_DIGEST_SYSTEM,
        prompt: digestInput(row),
        maxOutputTokens: 400,
      });
    } catch (error) {
      await this.markAttempt(userId, readId);
      throw error;
    }
    const description = cleanDescription(respuesta.text);

    try {
      if (!description) {
        await this.markAttempt(userId, readId);
        throw new Error(`El modelo no describió la página ${readId}`);
      }
      try {
        await this.dbService.runWithTenant(userId, async (tx) => {
          const saved = await this.repo.setDescription(tx, readId, description);
          if (!saved) return;
          // En la MISMA transacción que la descripción que cobra; el dedup del
          // ledger (referencia: la lectura) impide cobrarla dos veces.
          await this.credits.charge(tx, {
            userId,
            usage: chargeUsageOf(respuesta.usage),
            taskKind: TASK_KIND,
            reason: "content_digest",
            referenceType: "web_read",
            referenceId: readId,
          });
        });
      } catch (error) {
        // La transacción se deshizo y la descripción no quedó: sin anotar el
        // intento, cada turno volvería a pagar la llamada al modelo.
        await this.markAttempt(userId, readId);
        throw error;
      }
    } finally {
      await this.aiUsage.registrar({
        userId,
        chatId,
        task: TASK_KIND,
        modelo,
        usage: respuesta.usage,
        stepsCount: 1,
        arranque,
        runId,
        providerRaw: { usage: respuesta.usage, finishReason: respuesta.finishReason },
      });
    }
  }

  /** Anota un intento que no salió. Nunca lanza: el error que importa es el del intento. */
  private async markAttempt(userId: string, readId: string): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) => this.repo.markDescribeAttempt(tx, readId));
    } catch (error) {
      console.error(`[leer_enlace] No se anotó el intento de describir ${readId}:`, error);
    }
  }
}

/** Lo que lee quien describe: de dónde es la página y su principio, delimitado. */
export function digestInput(
  row: Pick<WebReadRow, "url" | "finalUrl" | "title" | "siteName" | "extractedText">,
): string {
  const where = safeName(row.finalUrl ?? row.url, 2048);
  const title = row.title ? `"${safeName(row.title)}"` : "sin título";
  const site = row.siteName ? `, de ${safeName(row.siteName)}` : "";
  const text = insideTag(sliceText(row.extractedText ?? "", DIGEST_SOURCE_CHARS), "pagina");
  return `Página: ${title}${site} (${where}).\n\n<pagina>\n${text}\n</pagina>`;
}
