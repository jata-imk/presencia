import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { DEFAULT_TRANSCRIPTION_CHAIN } from "../ai/provider-registry.js";
import { CreditsModule } from "../credits/credits.module.js";
import { env } from "../env.js";
import { buildTranscriptionChain, type TranscriptionChain } from "./transcription-chain.js";
import { TRANSCRIPTION_CHAIN, TranscriptionService } from "./transcription.service.js";

// F11 (ADR-030): las notas de voz de Telegram. Solo lo importa TelegramModule.
@Module({
  imports: [AiModule, CreditsModule],
  providers: [
    TranscriptionService,
    {
      // Solo con el bot prendido: es cuando env.ts valida la cadena y sus keys.
      provide: TRANSCRIPTION_CHAIN,
      useFactory: (): TranscriptionChain | null =>
        env.TELEGRAM_BOT_TOKEN
          ? buildTranscriptionChain(
              env.AI_MODEL_TRANSCRIBE ?? DEFAULT_TRANSCRIPTION_CHAIN,
              process.env,
              env.AI_FALLBACK_SIMULATE,
            )
          : null,
    },
  ],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
