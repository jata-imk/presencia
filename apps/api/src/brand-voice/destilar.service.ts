import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { generateObject, NoObjectGeneratedError, type LanguageModelUsage } from "ai";
import type { DestilarVozBody, VozDestiladaDto } from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { AiService } from "../ai/ai.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import {
  DISTILL_SYSTEM,
  distillPrompt,
  limpiarVozDestilada,
  vozDelModeloSchema,
} from "./destilar.js";

// Destilar la voz desde publicaciones del creator (F12.5). Primer call site de
// `voice_distill` (tier ADAPT; addendum F12.5 de ADR-004).
//
// Devuelve una PROPUESTA y no guarda nada: la pantalla (el último paso del
// onboarding) la muestra, el creator la ajusta y la guarda con el PATCH de la
// voz. La voz es del creator, no del sistema — y así no hace falta deshacer
// nada si dice "eso no soy yo".
//
// Se cobra como acción del creator (pegó sus publicaciones y siguió), por
// tokens y sin referencia: no hay fila que la represente.

const TASK_KIND = "voice_distill" as const;

@Injectable()
export class DestilarVozService {
  private readonly logger = new Logger(DestilarVozService.name);

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
  ) {}

  async destilar(userId: string, body: DestilarVozBody): Promise<VozDestiladaDto> {
    await this.credits.assertQuotaOr402(userId, getRateCard().minimumTurnUnits);

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    const registrar = (usage: LanguageModelUsage, finishReason: unknown) =>
      this.aiUsage.registrar({
        userId,
        task: TASK_KIND,
        modelo,
        usage,
        stepsCount: 1,
        arranque,
        providerRaw: { usage, finishReason },
      });

    let result;
    try {
      result = await generateObject({
        model: modelo.model,
        system: DISTILL_SYSTEM,
        schema: vozDelModeloSchema,
        prompt: distillPrompt(body),
      });
    } catch (error) {
      // Un objeto que no pasa el schema se pagó igual: el usage viene en el
      // error (mismo trato que card-rewrite.service.ts).
      if (NoObjectGeneratedError.isInstance(error) && error.usage) {
        await registrar(error.usage, error.finishReason);
        await this.charge(userId, error.usage);
      } else {
        // El proveedor (y su respaldo) falló: no hay usage que registrar ni
        // cobrar. Al creator, en pleno onboarding, el mismo aviso en español
        // y no un 500 crudo (revisión del PR3).
        this.logger.warn(`destilar falló sin salida del modelo: ${String(error)}`);
      }
      throw new ServiceUnavailableException(
        "No pudimos leer tus publicaciones. Inténtalo de nuevo.",
      );
    }

    await registrar(result.usage, result.finishReason);
    await this.charge(userId, result.usage);
    return limpiarVozDestilada(result.object);
  }

  private async charge(userId: string, usage: LanguageModelUsage): Promise<void> {
    await this.dbService.runWithTenant(userId, (tx) =>
      this.credits.charge(tx, {
        userId,
        usage: chargeUsageOf(usage),
        taskKind: TASK_KIND,
        reason: "voice_distill",
      }),
    );
  }
}
