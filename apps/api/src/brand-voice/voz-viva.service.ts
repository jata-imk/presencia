import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { generateObject, NoObjectGeneratedError, type LanguageModelUsage } from "ai";
import {
  decisionesDeVoz,
  fueEditada,
  proponerAjustesDeVoz,
  REVISAR_EDICIONES_MAX,
  REVISAR_EDICIONES_MINIMO,
  rasgoDeRegla,
  reglaDeVozVivaSchema,
  REGLAS_DE_VOZ_VIVA,
  type DecisionDeVoz,
  type PropuestasDeVozDto,
  type ReglaDeVozViva,
  type RevisionDeEdicionesDto,
} from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { AiService } from "../ai/ai.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService, type Tx } from "../db/db.service.js";
import { BrandVoiceRepository } from "./brand-voice.repository.js";
import {
  limpiarRevision,
  REVISAR_SYSTEM,
  revisarPrompt,
  revisionDelModeloSchema,
} from "./revisar-ediciones.js";
import { VozVivaRepository } from "./voz-viva.repository.js";

// «Aprender de mis ediciones» (F12.5, voz viva; doc de Voz de marca §14).
//
// - Las propuestas de las reglas se calculan al vuelo en cada lectura, sin
//   tabla: no hay nada que mantener sincronizado con las cards. Solo se
//   guarda la última decisión del creator por regla.
// - «Revisar mis ediciones» llama al modelo (`voice_distill`, segundo call
//   site; addendum F12.5 de ADR-004) y se cobra como acción del creator. Sus
//   propuestas son efímeras: viven en la pantalla hasta que dice "Agregar" o
//   "No".
// - Ninguna de las dos cambia la voz. El rasgo aceptado lo guarda la pantalla
//   con el PATCH de «Así escribes», que es el único que escribe `style_notes`.

const TASK_KIND = "voice_distill" as const;

@Injectable()
export class VozVivaService {
  private readonly logger = new Logger(VozVivaService.name);

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BrandVoiceRepository) private readonly voces: BrandVoiceRepository,
    @Inject(VozVivaRepository) private readonly repo: VozVivaRepository,
  ) {}

  propuestas(userId: string): Promise<PropuestasDeVozDto> {
    return this.dbService.runWithTenant(userId, (tx) => this.calcular(tx));
  }

  aprender(userId: string, aprender: boolean): Promise<PropuestasDeVozDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      await this.vozDefault(tx);
      await this.repo.setAprender(tx, aprender);
      return this.calcular(tx);
    });
  }

  decidir(userId: string, regla: ReglaDeVozViva, decision: DecisionDeVoz): Promise<void> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      await this.vozDefault(tx);
      await this.repo.guardarDecision(tx, regla, decision);
    });
  }

  async revisar(userId: string): Promise<RevisionDeEdicionesDto> {
    const { ediciones, rasgos, pendientes, rechazadas } = await this.dbService.runWithTenant(
      userId,
      async (tx) => {
        const voz = await this.vozDefault(tx);
        // Apagado es apagado: una pestaña vieja o un POST directo mandarían sus
        // ediciones al modelo y cobrarían (revisión del PR6).
        if (!voz.learnFromEdits) {
          throw new ConflictException("Prende «Aprender de mis ediciones» para revisarlas.");
        }
        const todas = await this.repo.ediciones(tx, voz.id);
        const decisiones = decisionesDeVoz(voz.voiceProposalDecisions);
        // Lo que las reglas ya están proponiendo en pantalla: la IA no lo repite.
        const pendientes = proponerAjustesDeVoz(todas, { rasgos: voz.styleNotes, decisiones });
        return {
          ediciones: todas.filter(fueEditada).slice(0, REVISAR_EDICIONES_MAX),
          rasgos: voz.styleNotes,
          pendientes,
          // Y lo que ya dijo que no: la revisión pagada no se lo vuelve a
          // proponer con otras palabras (revisión de la fase). Salvo que la
          // regla ya lo esté proponiendo otra vez con evidencia nueva: entonces
          // es un tema abierto, no uno cerrado (revisión del PR7).
          rechazadas: REGLAS_DE_VOZ_VIVA.filter(
            (regla) =>
              decisiones[regla]?.decision === "descartada" &&
              !pendientes.some((p) => p.id === regla),
          ),
        };
      },
    );
    // Antes de la cuota: con una sola edición no hay patrón posible, y
    // cobrarle al creator por enterarse sería cobrar un error. La pantalla ya
    // deshabilita el botón; esto cubre la carrera.
    if (ediciones.length < REVISAR_EDICIONES_MINIMO) {
      throw new ConflictException(
        "Todavía no hay suficientes publicaciones editadas para revisar. Edita y programa un par más.",
      );
    }
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
        system: REVISAR_SYSTEM,
        schema: revisionDelModeloSchema,
        prompt: revisarPrompt(ediciones, rasgos, {
          propuestos: pendientes.map((p) => p.rasgo),
          rechazados: rechazadas.map(rasgoDeRegla),
        }),
      });
    } catch (error) {
      // Mismo trato que destilar: un objeto inválido se pagó igual.
      if (NoObjectGeneratedError.isInstance(error) && error.usage) {
        await registrar(error.usage, error.finishReason);
        await this.charge(userId, error.usage);
      } else {
        this.logger.warn(`revisar ediciones falló sin salida del modelo: ${String(error)}`);
      }
      throw new ServiceUnavailableException(
        "No pudimos revisar tus ediciones. Inténtalo de nuevo.",
      );
    }

    await registrar(result.usage, result.finishReason);
    await this.charge(userId, result.usage);
    return {
      propuestas: limpiarRevision(result.object, ediciones, rasgos, [
        ...pendientes.flatMap((p) => {
          const regla = reglaDeVozVivaSchema.safeParse(p.id);
          return regla.success ? [regla.data] : [];
        }),
        ...rechazadas,
      ]),
    };
  }

  private async calcular(tx: Tx): Promise<PropuestasDeVozDto> {
    const voz = await this.vozDefault(tx);
    if (!voz.learnFromEdits) return { aprender: false, propuestas: [], edicionesParaRevisar: 0 };
    const ediciones = await this.repo.ediciones(tx, voz.id);
    return {
      aprender: true,
      propuestas: proponerAjustesDeVoz(ediciones, {
        rasgos: voz.styleNotes,
        decisiones: decisionesDeVoz(voz.voiceProposalDecisions),
      }),
      edicionesParaRevisar: Math.min(ediciones.filter(fueEditada).length, REVISAR_EDICIONES_MAX),
    };
  }

  private async vozDefault(tx: Tx) {
    const voz = await this.voces.findDefault(tx);
    if (!voz) throw new NotFoundException("Aún no configuras tu voz de marca.");
    return voz;
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
