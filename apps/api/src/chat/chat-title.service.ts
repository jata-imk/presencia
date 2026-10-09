import { Inject, Injectable } from "@nestjs/common";
import { generateText, type UIMessage } from "ai";
import { AiService } from "../ai/ai.service.js";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { ChatRepository } from "./chat.repository.js";
import {
  TITLE_ATTEMPTS,
  TITLE_SYSTEM,
  assistantTurns,
  cleanTitle,
  transcriptForTitle,
} from "./chat-title.js";

// Título automático del chat (F10.8). Decisiones de Jose (2026-10-07):
// - Se genera tras la PRIMERA respuesta. Si ese intercambio todavía no dice de
//   qué va ("hola"), se reintenta en las respuestas siguientes, hasta la
//   tercera; después, el chat se queda en "Nuevo chat" hasta que lo renombre.
// - Una sola vez: un chat titulado no se vuelve a titular, y uno renombrado a
//   mano (`title_source = 'user'`) nunca se toca.
// - Se cobra con la tarifa utility (`chat_title`), una vez por chat.
//
// Corre fuera del turno, sin que nadie lo espere: el creator ya tiene su
// respuesta, y el título llega a la pantalla por el stream de eventos
// (`chat_changed`, F8.6).

const TASK_KIND = "chat_title" as const;

@Injectable()
export class ChatTitleService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {}

  /**
   * Titula el chat si toca. Nunca lanza: un título que no salió no puede
   * costarle nada al turno, que ya terminó.
   *
   * `conversation` es el historial con la respuesta que acaba de llegar, y
   * `runId` el turno que la produjo (F10.8.1: la traza liga el título a él).
   */
  async maybeTitle(
    userId: string,
    chatId: string,
    conversation: UIMessage[],
    runId?: string,
  ): Promise<void> {
    try {
      if (assistantTurns(conversation) > TITLE_ATTEMPTS) return;
      const chat = await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.getChat(tx, chatId),
      );
      if (!chat || chat.titleSource !== "default") return;
      const transcript = transcriptForTitle(conversation);
      if (!transcript) return;

      const modelo = this.ai.resolveForTask(TASK_KIND);
      const arranque = Date.now();
      const respuesta = await generateText({
        model: modelo.model,
        system: TITLE_SYSTEM,
        prompt: transcript,
      });
      const title = cleanTitle(respuesta.text);

      if (title) {
        await this.dbService.runWithTenant(userId, async (tx) => {
          const saved = await this.repo.setAutoTitle(tx, chatId, title);
          // Lo renombró el creator mientras el modelo pensaba: gana el suyo,
          // y un título que no quedó no se cobra.
          if (!saved) return;
          // En la MISMA transacción que el título que cobra. La referencia es
          // el chat: el dedup del ledger impide cobrar dos títulos al mismo.
          await this.credits.charge(tx, {
            userId,
            usage: chargeUsageOf(respuesta.usage),
            taskKind: TASK_KIND,
            reason: "chat_title",
            referenceType: "chat",
            referenceId: chatId,
          });
        });
      }

      // Siempre que hubo llamada, aunque no saliera título: los tokens se
      // pagaron igual, y ai_usage_events es telemetría de gasto, no de cobro.
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
    } catch (error) {
      console.error(`[chat] No se pudo titular el chat ${chatId}:`, error);
    }
  }
}
