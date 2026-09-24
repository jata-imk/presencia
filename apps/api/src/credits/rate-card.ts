import { creditReason, planTier } from "../db/schema.js";
import type { AiTaskKind } from "../ai/provider-registry.js";

// F5 (ADR-012 addendum, 2026-08-09): la unidad normalizada del ledger.
// Nunca tokens directos (no expresan el costo de una imagen), nunca
// dólares directos (los precios de proveedor cambian bajo los pies).
// Enteros siempre — dinero en float es como nacen los bugs de contabilidad
// que nadie encuentra.

export type PlanTier = (typeof planTier.enumValues)[number];
export type CreditReason = (typeof creditReason.enumValues)[number];

export interface TokenRate {
  /** Unidades por cada 1,000 tokens de este tipo. */
  input: number;
  output: number;
  cachedInput: number;
}

export interface RateCard {
  version: number;
  /**
   * Traducción a objeto contable: cuántas unidades "gasta" una publicación
   * típica. Es el denominador de "te alcanza para ~N publicaciones más" —
   * nunca se muestra el número crudo de unidades al usuario.
   */
  unitsPerPublication: number;
  /** Gate antes de arrancar un turno de chat (bloqueo suave, no cobro). */
  minimumTurnUnits: number;
  perThousandTokens: Record<AiTaskKind, TokenRate>;
  /** Costo fijo para acciones que no se miden en tokens del turno de chat. */
  flat: Partial<Record<CreditReason, number>>;
}

// Todos los valores numéricos de aquí abajo son PROVISIONALES — se calibran
// con datos reales de ai_usage_events en "Backlog · Calibrar rate card con
// datos reales de consumo" (bloqueada por falta de consumo real, no F5).
// F5 entrega el mecanismo: versionado, para que recalibrar no rompa los
// asientos viejos (ADR-012).

export const CURRENT_RATE_CARD_VERSION = 1;

const UTILITY_RATE: TokenRate = { input: 2, output: 6, cachedInput: 1 };
const ADAPT_RATE: TokenRate = { input: 5, output: 15, cachedInput: 2 };
const CHAT_RATE: TokenRate = { input: 8, output: 24, cachedInput: 2 };

export const RATE_CARDS: Record<number, RateCard> = {
  1: {
    version: 1,
    unitsPerPublication: 1000,
    minimumTurnUnits: 50,
    perThousandTokens: {
      chat: CHAT_RATE,
      chat_title: UTILITY_RATE,
      history_compaction: UTILITY_RATE,
      analytics_narration: UTILITY_RATE,
      post_adapt: ADAPT_RATE,
      voice_distill: ADAPT_RATE,
    },
    flat: {
      idea_generation: 300,
      multi_adapt: 900,
      image_generation: 700,
      weekly_calendar: 1800,
      // Adelantar el refresco de tendencias (F9.6). Tarifa fija y no por
      // tokens porque el grueso del costo NO son tokens: el fee del grounding
      // se cobra por consulta de búsqueda —medidas, 4 por refresco— y los dos
      // modelos que intervienen aportan unos pocos miles de tokens entre los
      // dos. Cobrarlo por tokens subestimaría justo la parte cara.
      //
      // El refresco PERIÓDICO no pasa por acá: lo absorbe el negocio
      // (ADR-024). Esto solo cobra adelantarlo.
      trend_refresh: 800,
      // `ritmo_narration` NO está acá, y no es un olvido: se cobra por tokens
      // (perThousandTokens.analytics_narration), no con tarifa fija, porque su
      // costo depende del texto que produce.
    },
  },
};

// Cuota mensual por tier (unidades). Vive en código, no en la DB —
// cambiarla no debe requerir migración.
export const PLAN_QUOTAS: Record<PlanTier, number> = {
  creator: 30_000,
  pro: 90_000,
  agencia: 300_000,
};

export function getRateCard(version: number = CURRENT_RATE_CARD_VERSION): RateCard {
  const card = RATE_CARDS[version];
  if (!card) throw new Error(`No hay rate card registrada para la versión ${version}.`);
  return card;
}

export interface ChatTurnUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number | null;
}

/**
 * Normaliza el usage crudo de un turno (misma forma que
 * AiUsageRepository.insertEvent) a unidades enteras. Nunca retorna 0: el
 * CHECK (delta <> 0) de credit_ledger prohíbe asientos nulos, y todo turno
 * real con respuesta cuesta al menos 1 unidad.
 */
export function quoteChatTurn(
  usage: ChatTurnUsage,
  taskKind: AiTaskKind,
  version: number = CURRENT_RATE_CARD_VERSION,
): number {
  const rate = getRateCard(version).perThousandTokens[taskKind];
  const cached = usage.cachedInputTokens ?? 0;
  const billableInput = Math.max(usage.inputTokens - cached, 0);
  const units =
    (billableInput / 1000) * rate.input +
    (cached / 1000) * rate.cachedInput +
    (usage.outputTokens / 1000) * rate.output;
  return Math.max(Math.ceil(units), 1);
}

/** Costo fijo de una acción no medida en tokens. Lanza si el reason no tiene tarifa fija. */
export function quoteFlatAction(
  reason: CreditReason,
  version: number = CURRENT_RATE_CARD_VERSION,
): number {
  const units = getRateCard(version).flat[reason];
  if (units === undefined) {
    throw new Error(`El rate card v${version} no tiene tarifa fija para "${reason}".`);
  }
  return units;
}

/**
 * Qué porción de la cuota del mes se lleva una acción de tarifa fija.
 *
 * El otro objeto contable, además de "publicaciones": `unitsToPublications`
 * redondea hacia abajo contra 1.000 unidades, así que todo lo que cuesta menos
 * de una publicación se muestra como "0" — inservible justo para anunciar el
 * precio de un botón. El porcentaje sí distingue.
 *
 * Con un decimal, y nunca 0 si la acción cuesta algo: "0%" en un botón que
 * cobra es mentira, aunque sea una mentira de redondeo.
 */
export function flatActionPercentOfQuota(
  reason: CreditReason,
  tier: PlanTier,
  version: number = CURRENT_RATE_CARD_VERSION,
): number {
  const units = quoteFlatAction(reason, version);
  const quota = PLAN_QUOTAS[tier];
  if (quota <= 0) return 0;
  return Math.max(Math.round((units / quota) * 1000) / 10, 0.1);
}

/** El objeto contable que ve el usuario: cuántas publicaciones más le alcanzan. */
export function unitsToPublications(
  units: number,
  version: number = CURRENT_RATE_CARD_VERSION,
): number {
  return Math.max(Math.floor(units / getRateCard(version).unitsPerPublication), 0);
}
