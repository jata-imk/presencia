import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { generateText } from "ai";
import type { RitmoNarracionDto } from "@presencia/shared";
import { AiService, type ResolvedModel } from "../ai/ai.service.js";
import { AiUsageRepository } from "../ai/ai-usage.repository.js";
import { CreditsService } from "../credits/credits.service.js";
import { DbService } from "../db/db.service.js";
import { MetricsEngineService } from "../metrics/metrics-engine.service.js";
import { fechaLocal } from "../metrics/hora-local.js";
import { ProfileRepository } from "../profile/profile.repository.js";
import { armarPayload, promptDeNarracion, type PayloadDeNarracion } from "./narracion.js";
import { RitmoRepository, type NarracionRow } from "./ritmo.repository.js";
import { RitmoService } from "./ritmo.service.js";

// "Explícame mi ritmo": el único lugar de F9 donde entra un modelo a hablarle
// al usuario de sus propios números.
//
// Tres decisiones cargan el diseño:
//
// 1. **Bajo demanda, nunca automática.** Narrar el ritmo de todos los usuarios
//    cada mañana sería pagar por texto que casi nadie abre. El botón es lo que
//    dice que a alguien le interesa.
//
// 2. **Una por día, guardada.** La segunda pulsada del mismo día devuelve la
//    misma narración y no cobra. Lo garantiza el índice único de
//    `ritmo_narrations`, no un `if`: dos clicks simultáneos chocan contra la
//    base, no contra una condición que puede perder la carrera.
//
// 3. **El número sale de SQL.** El modelo recibe el payload ya calculado y el
//    prompt le prohíbe producir cifras que no estén en él (narracion.ts).

/** Lo que `registrarUsage` necesita de `generateText`, y nada más. */
type RespuestaDeModelo = Pick<
  Awaited<ReturnType<typeof generateText>>,
  "usage" | "finishReason" | "providerMetadata"
>;

const TASK_KIND = "analytics_narration" as const;

/** Lo que el ledger apunta, con `reference_id` = el id de la fila narrada. */
const REFERENCE_TYPE = "ritmo_narration";

/**
 * El piso de saldo para narrar.
 *
 * Deliberadamente 1 y no `minimumTurnUnits`: ese piso es de un turno de chat,
 * que cuesta un orden de magnitud más. Acá la pregunta no es "¿te alcanza?"
 * sino "¿te queda algo?" — narrar cuesta poco, pero no es gratis, y una cuenta
 * agotada no puede seguir llamando al modelo.
 */
const UNIDADES_MINIMAS = 1;

@Injectable()
export class NarracionService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageRepository) private readonly usageRepo: AiUsageRepository,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(MetricsEngineService) private readonly motor: MetricsEngineService,
    @Inject(ProfileRepository) private readonly profileRepo: ProfileRepository,
    @Inject(RitmoRepository) private readonly repo: RitmoRepository,
    @Inject(RitmoService) private readonly ritmo: RitmoService,
  ) {}

  /**
   * La narración de hoy: la guardada si existe, una nueva si no.
   *
   * El orden importa y no es el obvio. Primero se lee lo guardado, y recién
   * después se arman los números y se llama al modelo: al revés, cada click
   * pagaría la llamada para después descubrir que ya había una.
   */
  async narrar(userId: string): Promise<RitmoNarracionDto> {
    const perfil = await this.profileRepo.findById(userId);
    if (!perfil) throw new NotFoundException("No encontramos tu perfil.");

    const ahora = new Date();
    // El día LOCAL del usuario. Con UTC, a alguien en Mérida la ventana se le
    // cortaría a las 18:00 y el botón volvería a cobrar esa misma tarde.
    const dia = fechaLocal(ahora, perfil.timezone).dia;

    const guardada = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.narracionDe(tx, dia),
    );
    if (guardada) return aDto(guardada);

    // El gate va antes de la llamada, no después: cobrar post-hoc puede dejar
    // saldo negativo a propósito (ADR-012), y sin este piso una cuenta agotada
    // seguiría generando texto gratis, una vez por día, para siempre.
    await this.credits.assertQuotaOr402(userId, UNIDADES_MINIMAS);

    const payload = await this.payloadDe(userId, perfil.timezone, ahora);
    const arranque = Date.now();
    const modelo = this.ai.resolveForTask(TASK_KIND);
    const respuesta = await generateText({
      model: modelo.model,
      prompt: promptDeNarracion(payload, perfil.displayName ?? perfil.name),
    });
    const body = respuesta.text.trim();
    // Sin texto no hay nada que guardar ni que cobrar. Guardar el vacío
    // gastaría la única narración del día del usuario en una fila en blanco.
    //
    // El usage SÍ se registra: la llamada se pagó igual. Sin esta línea, un
    // proveedor devolviendo vacío en serie sería invisible justo en la tabla
    // con la que se calibra el rate card.
    if (body.length === 0) {
      await this.registrarUsage(userId, modelo, respuesta, arranque);
      throw new ServiceUnavailableException("No pudimos redactar tu resumen. Inténtalo de nuevo.");
    }

    const guardado = await this.dbService.runWithTenant(userId, async (tx) => {
      // `onConflictDoNothing` + relectura, y no un `if` previo: entre la
      // lectura de arriba y esta escritura cabe otro click. El que pierde la
      // carrera devuelve la narración del que ganó y NO cobra — se perdió una
      // llamada al modelo, que es mejor que cobrar dos veces por el mismo día.
      const insertada = await this.repo.guardarNarracion(tx, { userId, dia, body, payload });
      if (!insertada) return { fila: await this.repo.narracionDe(tx, dia), cobrada: false };

      // En la MISMA transacción que la fila que cobra (modelo-de-datos.md: "o
      // se cobra y se produce el efecto, o ninguna de las dos").
      await this.credits.charge(tx, {
        userId,
        usage: {
          inputTokens: respuesta.usage.inputTokens ?? 0,
          outputTokens: respuesta.usage.outputTokens ?? 0,
          cachedInputTokens: respuesta.usage.inputTokenDetails.cacheReadTokens ?? null,
        },
        taskKind: TASK_KIND,
        reason: "ritmo_narration",
        referenceType: REFERENCE_TYPE,
        referenceId: insertada.id,
      });
      return { fila: insertada, cobrada: true };
    });

    if (!guardado.fila) {
      // La fila desapareció entre el conflicto y la relectura: solo pasa si el
      // ganador de la carrera se revirtió. Se dice, no se finge.
      throw new ServiceUnavailableException("No pudimos guardar tu resumen. Inténtalo de nuevo.");
    }

    // Se registra SIEMPRE que hubo llamada, gane o pierda la carrera: el
    // perdedor no cobra, pero sus tokens se consumieron igual y `ai_usage_events`
    // es telemetría de gasto, no de cobro. Si solo se registrara lo cobrado, la
    // tabla con la que se calibra el rate card subestimaría el costo real.
    await this.registrarUsage(userId, modelo, respuesta, arranque);

    return aDto(guardado.fila);
  }

  /**
   * La fila de `ai_usage_events`.
   *
   * Try/catch propio (patrón de F4.5 en chat.service.ts): un fallo al registrar
   * usage nunca puede costar la narración ni el cobro, que ya se persistieron.
   */
  private async registrarUsage(
    userId: string,
    modelo: ResolvedModel,
    respuesta: RespuestaDeModelo,
    arranque: number,
  ): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.usageRepo.insertEvent(tx, {
          userId,
          chatId: null,
          taskKind: TASK_KIND,
          provider: modelo.provider,
          model: modelo.modelName,
          inputTokens: respuesta.usage.inputTokens ?? 0,
          outputTokens: respuesta.usage.outputTokens ?? 0,
          cachedInputTokens: respuesta.usage.inputTokenDetails.cacheReadTokens ?? null,
          // Una llamada, sin tools: no hay pasos que contar.
          stepsCount: 1,
          durationMs: Date.now() - arranque,
          providerRaw: {
            usage: respuesta.usage,
            finishReason: respuesta.finishReason,
            providerMetadata: respuesta.providerMetadata,
          },
        }),
      );
    } catch (error) {
      console.error(`[ritmo] No se pudo registrar el usage de la narración de ${userId}:`, error);
    }
  }

  /**
   * Los números.
   *
   * Reusa `RitmoService.resumen` para cadencia y objetivos porque el "vas 8/14"
   * de la narración tiene que ser el MISMO que el de la cabecera: dos
   * aritméticas del mismo número es como se llega a un párrafo que contradice
   * la pantalla que lo rodea.
   */
  private async payloadDe(
    userId: string,
    timezone: string,
    ahora: Date,
  ): Promise<PayloadDeNarracion> {
    const resumen = await this.ritmo.resumen(userId);
    const horarios = await this.dbService.runWithTenant(userId, (tx) =>
      this.motor.horariosDeVarias(tx, resumen.redesConectadas, { timezone, ahora }),
    );
    return armarPayload(
      resumen.cadencia,
      resumen.objetivos,
      horarios,
      resumen.modo,
      resumen.modoSugerido,
    );
  }
}

function aDto(fila: NarracionRow): RitmoNarracionDto {
  return { body: fila.body, generatedAt: fila.generatedAt.toISOString() };
}
