import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  asVerticalId,
  META_SEMANAL_SUGERIDA,
  resolveMacroRegion,
  resolveVertical,
  type RitmoCadenciaDto,
  type RitmoHorariosDto,
  type RitmoObjetivoDto,
  type RitmoResumenDto,
  type SocialNetwork,
  type TrendsDto,
} from "@presencia/shared";
import { BrandVoiceRepository } from "../brand-voice/brand-voice.repository.js";
import { DbService } from "../db/db.service.js";
import { MetricsEngineService } from "../metrics/metrics-engine.service.js";
import { fechaLocal, sumarDias } from "../metrics/hora-local.js";
import { ProfileRepository } from "../profile/profile.repository.js";
import { TrendsRepository } from "../trends/trends.repository.js";
import { TrendsService } from "../trends/trends.service.js";
import { RitmoRepository } from "./ritmo.repository.js";

// El módulo Ritmo por HTTP: junta lo que el motor calcula, lo que el usuario
// configuró y lo que la caché de tendencias tenga guardado.
//
// Acá NO se calcula engagement. La fórmula vive en el motor de métricas
// (ADR-022) porque Analíticas va a leer los mismos números; este servicio solo
// decide qué se expone y con qué forma.

@Injectable()
export class RitmoService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(MetricsEngineService) private readonly motor: MetricsEngineService,
    @Inject(RitmoRepository) private readonly repo: RitmoRepository,
    @Inject(BrandVoiceRepository) private readonly voiceRepo: BrandVoiceRepository,
    @Inject(ProfileRepository) private readonly profileRepo: ProfileRepository,
    @Inject(TrendsRepository) private readonly trendsRepo: TrendsRepository,
    @Inject(TrendsService) private readonly trendsService: TrendsService,
  ) {}

  /**
   * La cabecera y los dos primeros bloques: cadencia, racha y metas.
   *
   * Todo en una sola transacción y una sola respuesta porque la pantalla los
   * muestra juntos: partirlos en tres endpoints haría tres viajes para pintar
   * una vista que siempre aparece completa.
   */
  async resumen(userId: string): Promise<RitmoResumenDto> {
    const timezone = await this.timezoneDe(userId);
    const ahora = new Date();

    return this.dbService.runWithTenant(userId, async (tx) => {
      const cadencia = await this.motor.cadencia(tx, { timezone, ahora });
      const metas = await this.repo.metas(tx);
      const redesConectadas = await this.repo.redesConectadas(tx);
      return {
        cadencia,
        objetivos: this.objetivosDe(cadencia, metas, redesConectadas, timezone, ahora),
        redesConectadas,
        timezone,
      };
    });
  }

  async horarios(userId: string, network: SocialNetwork): Promise<RitmoHorariosDto> {
    const timezone = await this.timezoneDe(userId);
    const ahora = new Date();
    return this.dbService.runWithTenant(userId, (tx) =>
      this.motor.horariosDe(tx, network, { timezone, ahora }),
    );
  }

  /**
   * Las tendencias del nicho del usuario.
   *
   * Cuando la tupla nunca se ha buscado devuelve el DTO igual, con `items`
   * vacío y `generatedAt` en `null`. La vertical y la región viajan siempre
   * porque son lo que vuelve honesto al estado vacío: "no encontramos
   * tendencias de Diseño en el Sureste" dice algo; "no hay nada", no.
   *
   * Las **vencidas sí se devuelven**, con su fecha, porque tendencias de ayer
   * fechadas le sirven más al usuario que un módulo apagado — el job las
   * refresca por su cuenta.
   */
  async tendencias(userId: string): Promise<TrendsDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const voz = await this.voiceRepo.findDefault(tx);
      if (!voz) throw new NotFoundException("Aún no configuras tu voz de marca.");

      // `asVerticalId` y no un cast: la columna es `text`, así que una vertical
      // retirada vuelve como null y el usuario cae a la derivación por nicho en
      // vez de arrastrar una llave de caché que ya no existe.
      const vertical = resolveVertical(asVerticalId(voz.vertical), voz.niche);
      const region = resolveMacroRegion(voz.marketCountry, voz.marketRegion);
      const guardadas = await this.trendsRepo.find(tx, {
        vertical,
        marketCountry: voz.marketCountry,
        region,
      });
      // Nunca buscada: se pide la primera búsqueda. Sin esto el módulo no
      // arranca jamás para un nicho nuevo — el barrido periódico solo refresca
      // filas que ya existen, así que una tupla sin fila no entra a su pase.
      if (!guardadas) {
        await this.trendsService.pedirPrimeraBusqueda({
          vertical,
          marketCountry: voz.marketCountry,
          region,
        });
      }

      return {
        vertical,
        region,
        items: guardadas?.items ?? [],
        generatedAt: guardadas?.generatedAt.toISOString() ?? null,
      };
    });
  }

  async guardarMeta(
    userId: string,
    network: SocialNetwork,
    meta: number,
  ): Promise<RitmoResumenDto> {
    await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.guardarMeta(tx, userId, network, meta),
    );
    // Se devuelve el resumen completo y no solo la meta: el objetivo cambia el
    // "vas 8/14" de la cabecera, y devolver la pieza suelta obligaría a la
    // pantalla a recalcularlo por su cuenta — dos aritméticas del mismo número.
    return this.resumen(userId);
  }

  /**
   * Metas y avance de la semana en curso, por red.
   *
   * Solo aparecen las redes conectadas: una meta para una red que el usuario
   * no conectó es una vara de medir que él nunca aceptó y que además nunca va
   * a poder cumplir desde acá.
   */
  private objetivosDe(
    cadencia: RitmoCadenciaDto,
    metas: Map<SocialNetwork, number>,
    redes: readonly SocialNetwork[],
    timezone: string,
    ahora: Date,
  ): RitmoObjetivoDto[] {
    // La semana empieza el lunes, igual que el heatmap y que el Calendario.
    const hoy = fechaLocal(ahora, timezone);
    const lunes = sumarDias(hoy.dia, -hoy.diaSemana);
    const deLaSemana = cadencia.dias.filter((dia) => dia.dia >= lunes);

    return redes.map((network) => {
      const propia = metas.get(network);
      return {
        network,
        meta: propia ?? META_SEMANAL_SUGERIDA[network],
        hechas: deLaSemana.reduce((suma, dia) => suma + (dia.porRed[network] ?? 0), 0),
        sugerido: propia === undefined,
      };
    });
  }

  private async timezoneDe(userId: string): Promise<string> {
    // `users` no tiene RLS (Better Auth es su dueño), así que esta lectura va
    // fuera del tenant y filtra por id explícito, como todo ProfileRepository.
    const fila = await this.profileRepo.findById(userId);
    if (!fila) throw new NotFoundException("No encontramos tu perfil.");
    return fila.timezone;
  }
}
