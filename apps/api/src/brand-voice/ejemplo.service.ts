import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { generateText } from "ai";
import { sql } from "drizzle-orm";
import type { BrandVoiceExampleDto } from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { AiService } from "../ai/ai.service.js";
import { buildSystemPrompt } from "../chat/system-prompt.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { BrandVoiceRepository } from "./brand-voice.repository.js";
import { BrandVoiceService } from "./brand-voice.service.js";
import { promptDeEjemplo } from "./ejemplo.js";

// "Ver ejemplo de tu voz" (F9.7, doc de Voz de marca §5): un post de muestra
// escrito con la voz que el usuario tiene GUARDADA.
//
// Tres decisiones del doc que este servicio sostiene:
//
// 1. **Manual, nunca automático.** Regenerar en cada tecla sería cobrar por
//    configurar, no por crear. Por eso es un POST detrás de un botón.
// 2. **No es contenido.** No se guarda en Biblioteca ni aparece como
//    borrador: es una muestra. Desde F12.5 se guarda el ÚLTIMO en la voz
//    (`last_voice_example`, sin historial) para mostrarlo al volver; el cobro
//    sigue sin referencia y sin deduplicar — cada click es una llamada.
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
    @Inject(BrandVoiceRepository) private readonly repo: BrandVoiceRepository,
  ) {}

  async generar(userId: string): Promise<BrandVoiceExampleDto> {
    const voz = await this.voices.getDefaultForPrompt(userId);
    if (!voz) throw new NotFoundException("Aún no configuras tu voz de marca.");

    // El mismo piso que un turno de chat: lo que se genera es del mismo
    // tamaño y con el mismo modelo.
    await this.credits.assertQuotaOr402(userId, getRateCard().minimumTurnUnits);

    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    // La voz con la que se escribe es la de AHORA: si cambia mientras el
    // modelo escribe, el ejemplo ya es viejo. Por eso se fecha al pedir y no
    // al terminar (revisión del PR5), y con el reloj de Postgres, el mismo que
    // pone `updated_at`: con el de la app, un desfase entre el servidor y la
    // base prendía o escondía "Tu voz cambió" (revisión de la fase).
    const reloj = await this.dbService.db.execute<{ ahora: string }>(
      sql`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ahora`,
    );
    const pedidoEn = reloj.rows[0]?.ahora ?? new Date(arranque).toISOString();
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
    //
    // F12.5: en la misma transacción se guarda como el último ejemplo (sin
    // historial): lo que se cobró es lo que la pantalla muestra al volver.
    const ejemplo: BrandVoiceExampleDto = { text, generatedAt: pedidoEn };
    await this.dbService.runWithTenant(userId, async (tx) => {
      await this.credits.charge(tx, {
        userId,
        usage: chargeUsageOf(respuesta.usage),
        taskKind: TASK_KIND,
        reason: "voice_preview",
      });
      await this.repo.saveLastExample(tx, ejemplo);
    });

    return ejemplo;
  }
}
