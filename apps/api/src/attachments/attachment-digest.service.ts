import { Inject, Injectable } from "@nestjs/common";
import { generateText, type ModelMessage } from "ai";
import { AiService } from "../ai/ai.service.js";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { BossService } from "../jobs/boss.service.js";
import { AttachmentsRepository, type AttachmentRow } from "./attachments.repository.js";
import { AttachmentsService } from "./attachments.service.js";
import { insideTag, safeName } from "../chat/attachment-context.js";
import { DIGEST_SYSTEM, cleanDescription, sliceText } from "./attachment-digest.js";

// La descripción de cada adjunto (F10.9, ADR-006 addendum). Cuando un adjunto
// ya quedó atrás (fuera de los últimos turnos, attachment-context.ts) viaja
// como una línea con esto, en vez de sus bytes: describirlo una vez sale más
// barato que reenviarlo en cada turno, y deja al modelo saber qué había en la
// foto sin volver a verla.
//
// Corre en segundo plano, después de que el mensaje se guardó: el turno no lo
// espera. La tarea es genérica (`content_digest`): F10.10 describe igual las
// páginas que el chat lee.

export const ATTACHMENT_DIGEST_QUEUE = "attachment.describe";
export const ATTACHMENT_DIGEST_EXPIRE_SECONDS = 2 * 60;

export interface AttachmentDigestJob {
  userId: string;
  attachmentId: string;
  chatId: string;
  runId?: string;
}

const TASK_KIND = "content_digest" as const;

/** Cuánto texto de un archivo lee quien lo describe: el principio alcanza. */
const DIGEST_SOURCE_CHARS = 20_000;

@Injectable()
export class AttachmentDigestService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AttachmentsRepository) private readonly repo: AttachmentsRepository,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BossService) private readonly boss: BossService,
  ) {}

  /** Encola la descripción de los adjuntos de un mensaje recién guardado. Nunca lanza. */
  async enqueue(
    userId: string,
    chatId: string,
    attachmentIds: readonly string[],
    runId?: string,
  ): Promise<void> {
    await Promise.all(
      attachmentIds.map(async (attachmentId) => {
        const job: AttachmentDigestJob = { userId, attachmentId, chatId, runId };
        try {
          await this.boss.enqueue(ATTACHMENT_DIGEST_QUEUE, job, {
            singletonKey: attachmentId,
            expireInSeconds: ATTACHMENT_DIGEST_EXPIRE_SECONDS,
          });
        } catch (error) {
          // Sin descripción, el adjunto viaja como su principio o su nombre;
          // el siguiente turno la vuelve a pedir (ChatService.runAgentTurn).
          console.error(`[adjuntos] No se encoló la descripción de ${attachmentId}:`, error);
        }
      }),
    );
  }

  /**
   * El handler del job. Idempotente: uno que ya tiene descripción (otro job
   * se adelantó, o un reintento después de guardarla) no vuelve a llamar al
   * modelo ni a cobrar. Uno que ya no está en ningún mensaje (se quitó al
   * editar) tampoco: nadie lo va a volver a ver. Si falla, anota el intento
   * (el chat no la vuelve a pedir en un día) y lanza para que pg-boss
   * reintente; la llamada que ya se pagó queda registrada en ai_usage_events
   * aunque lo de después falle, y una respuesta vacía también se reintenta.
   */
  async describe(job: AttachmentDigestJob): Promise<void> {
    const { userId, attachmentId, chatId, runId } = job;
    const row = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findById(tx, attachmentId),
    );
    if (!row || row.description !== null || row.messageId === null) return;

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    let respuesta;
    try {
      respuesta = await generateText({
        model: modelo.model,
        system: DIGEST_SYSTEM,
        messages: await this.digestInput(row),
        maxOutputTokens: 400,
      });
    } catch (error) {
      await this.markAttempt(userId, attachmentId);
      throw error;
    }
    const description = cleanDescription(respuesta.text);

    try {
      if (!description) {
        await this.markAttempt(userId, attachmentId);
        throw new Error(`El modelo no describió el adjunto ${attachmentId}`);
      }
      try {
        await this.dbService.runWithTenant(userId, async (tx) => {
          const saved = await this.repo.setDescription(tx, attachmentId, description);
          if (!saved) return;
          // En la MISMA transacción que la descripción que cobra; el dedup del
          // ledger (referencia: el adjunto) impide cobrarla dos veces.
          await this.credits.charge(tx, {
            userId,
            usage: chargeUsageOf(respuesta.usage),
            taskKind: TASK_KIND,
            reason: "content_digest",
            referenceType: "message_attachment",
            referenceId: attachmentId,
          });
        });
      } catch (error) {
        // F10.10 (review): la transacción se deshizo y la descripción no
        // quedó; sin anotar el intento, cada turno volvería a pagar la
        // llamada al modelo.
        await this.markAttempt(userId, attachmentId);
        throw error;
      }
    } finally {
      // Siempre que hubo llamada: los tokens se pagaron aunque no quedara
      // descripción (ai_usage_events es gasto, no cobro). Nunca lanza.
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
  private async markAttempt(userId: string, attachmentId: string): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.markDescribeAttempt(tx, attachmentId),
      );
    } catch (error) {
      console.error(`[adjuntos] No se anotó el intento de describir ${attachmentId}:`, error);
    }
  }

  /** Lo que lee el modelo: la imagen o el PDF escaneado, o el principio del texto. */
  private async digestInput(row: AttachmentRow): Promise<ModelMessage[]> {
    // El nombre y el texto los escribió quien subió el archivo: escapados
    // igual que en el contexto del chat (attachment-context.ts).
    const intro = `Archivo: "${safeName(row.filename)}" (${row.mimeType}${row.pages ? `, ${row.pages} páginas` : ""}).`;
    if (row.extractedText !== null) {
      const text = insideTag(sliceText(row.extractedText, DIGEST_SOURCE_CHARS));
      return [{ role: "user", content: `${intro}\n\n<adjunto>\n${text}\n</adjunto>` }];
    }
    // Los bytes directo del bucket, sin la caché del chat: en el worker nadie
    // la volvería a leer.
    const data = await this.attachments.readModelBytes(row);
    return [
      {
        role: "user",
        content: [
          { type: "text", text: intro },
          { type: "file", mediaType: row.mimeType, data },
        ],
      },
    ];
  }
}
