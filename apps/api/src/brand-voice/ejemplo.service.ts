import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { generateText } from "ai";
import type { BrandVoiceExampleDto } from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { AiService } from "../ai/ai.service.js";
import { buildSystemPrompt } from "../chat/system-prompt.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { BrandVoiceService } from "./brand-voice.service.js";
import { promptDeEjemplo } from "./ejemplo.js";

// "Ver ejemplo de tu voz" (F9.7, doc de Voz de marca §5): un post de muestra
// escrito con la voz que el usuario tiene GUARDADA.
//
// Tres decisiones del doc que este servicio sostiene:
//
// 1. **Manual, nunca automático.** Regenerar en cada tecla sería cobrar por
//    configurar, no por crear. Por eso es un POST detrás de un botón.
// 2. **Efímero.** No se guarda en Biblioteca ni aparece como borrador: es una
//    muestra, no contenido del usuario. No hay fila, así que el cobro no lleva
//    referencia y no se deduplica — cada click es una llamada al modelo.
// 3. **Se cobra, y sin anunciar un número.** Por tokens, como un turno de chat
//    (mismo modelo, misma tarifa: MODEL_BY_TASK y RATE_CARDS). El costo se ve
//    en la cuota, nunca en el botón (addendum ADR-012).

const TASK_KIND = "voice_preview" as const;

@Injectable()
export class EjemploDeVozService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BrandVoiceService) private readonly voices: BrandVoiceService,
  ) {}

  async generar(userId: string): Promise<BrandVoiceExampleDto> {
    const voz = await this.voices.getDefaultForPrompt(userId);
    if (!voz) throw new NotFoundException("Aún no configuras tu voz de marca.");

    // El mismo piso que un turno de chat: lo que se genera es del mismo
    // tamaño y con el mismo modelo.
    await this.credits.assertQuotaOr402(userId, getRateCard().minimumTurnUnits);

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    const respuesta = await generateText({
      model: modelo.model,
      // El MISMO system prompt que el chat: si el ejemplo se escribiera con
      // otro, podría sonar distinto a lo que el chat produce después.
      system: buildSystemPrompt(voz),
      prompt: promptDeEjemplo(voz),
    });

    // Siempre, antes de decidir si sirvió: la llamada se pagó igual.
    await this.aiUsage.registrar({
      userId,
      task: TASK_KIND,
      modelo,
      usage: respuesta.usage,
      stepsCount: 1,
      arranque,
      providerRaw: {
        usage: respuesta.usage,
        finishReason: respuesta.finishReason,
        providerMetadata: respuesta.providerMetadata,
      },
    });

    const text = respuesta.text.trim();
    // Sin texto no hay nada que mostrar ni que cobrar.
    if (text.length === 0) {
      throw new ServiceUnavailableException("No pudimos escribir el ejemplo. Inténtalo de nuevo.");
    }

    // Se cobra ANTES de devolverlo: si el cobro falla, el usuario no recibe
    // el texto (modelo-de-datos.md: "o se cobra y se produce, o ninguna de
    // las dos"; acá producir es entregarlo). Puede sobregirar como cualquier
    // `charge()`: el gate de arriba es lo que evita que sea frecuente.
    await this.dbService.runWithTenant(userId, (tx) =>
      this.credits.charge(tx, {
        userId,
        usage: chargeUsageOf(respuesta.usage),
        taskKind: TASK_KIND,
        reason: "voice_preview",
      }),
    );

    return { text };
  }
}
