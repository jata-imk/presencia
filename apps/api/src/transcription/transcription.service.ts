import { Inject, Injectable, Logger } from "@nestjs/common";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { getRateCard, quoteFlatAction } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import type { TranscriptionChain } from "./transcription-chain.js";
import { billedMinutes } from "./voice.js";

// F11 (ADR-030): transcribir una nota de voz de Telegram. Pregunta a la
// cadena, cobra los minutos (tarifa fija por minuto iniciado,
// `flat.audio_transcription`) y deja su fila de gasto. El audio no se guarda:
// la transcripción es el texto del mensaje del creator.

export const TRANSCRIPTION_CHAIN = Symbol("TRANSCRIPTION_CHAIN");

/** Lo que cuesta transcribir una nota de `seconds`: lo que se cobra y lo que pide el gate. */
export function transcriptionUnits(seconds: number): number {
  return quoteFlatAction("audio_transcription") * billedMinutes(seconds);
}

export interface TranscribeInput {
  userId: string;
  /** El mensaje del creator que va a llevar la transcripción: la referencia del asiento. */
  messageId: string;
  audio: Uint8Array;
  /** La duración que da Telegram (`voice.duration`): de ella sale el cobro. */
  seconds: number;
  signal?: AbortSignal;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    // null sin bot: nadie transcribe, y la cadena exigiría keys que CI no tiene.
    @Inject(TRANSCRIPTION_CHAIN) private readonly chain: TranscriptionChain | null,
  ) {}

  /**
   * El gate antes de bajar y transcribir: que alcance para la nota Y para el
   * turno que la contesta (`minimumTurnUnits`). Lanza el 402 del chat, que el
   * bot ya traduce a "sin cuota". Sin él, se cobraría una nota cuyo turno el
   * chat después rechaza.
   */
  async assertQuota(userId: string, seconds: number): Promise<void> {
    await this.credits.assertQuotaOr402(
      userId,
      transcriptionUnits(seconds) + getRateCard().minimumTurnUnits,
    );
  }

  /**
   * Devuelve el texto tal cual (puede venir vacío: una nota en silencio).
   * Lanza si la cadena entera cae o si el creator detuvo: en los dos casos no
   * se cobra, porque ningún proveedor contestó.
   */
  async transcribe(input: TranscribeInput): Promise<string> {
    if (!this.chain) throw new Error("La transcripción está apagada (sin TELEGRAM_BOT_TOKEN).");
    const arranque = Date.now();
    const { text, raw, ran } = await this.chain.transcribe(input.audio, input.signal);

    // El proveedor ya cobró: se cobra aunque el texto venga vacío o el creator
    // detenga justo después (costo ya incurrido, como una búsqueda web).
    try {
      await this.db.runWithTenant(input.userId, (tx) =>
        this.credits.spend(tx, {
          userId: input.userId,
          reason: "audio_transcription",
          referenceType: "message",
          referenceId: input.messageId,
          count: billedMinutes(input.seconds),
          allowOverdraft: true,
        }),
      );
    } catch (error) {
      // Sin cobro el creator no pierde nada; sin su nota, sí. Se registra y se
      // sigue: la fila de gasto de abajo deja la transcripción a la vista.
      this.logger.error(
        `[transcripción] No se cobró la nota del mensaje ${input.messageId}:`,
        error,
      );
    }
    await this.aiUsage.registrar({
      userId: input.userId,
      task: "transcription",
      modelo: {
        provider: ran.provider,
        modelName: ran.modelName,
        fallbackFrom: ran.fallbackFrom,
        attempts: ran.attempts,
      },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      stepsCount: 1,
      arranque,
      audioSeconds: input.seconds,
      providerRaw: raw,
    });
    return text.trim();
  }
}
