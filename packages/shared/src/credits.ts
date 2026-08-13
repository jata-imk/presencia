// Contrato de cuota (F5, addendum ADR-012 2026-08-09). La web nunca ve
// unidades ni tokens — solo este DTO ya traducido a objeto contable. El
// rate card y la unidad normalizada viven en la API (credits/rate-card.ts),
// a propósito fuera de este paquete compartido.

export const PLAN_TIERS = ["creator", "pro", "agencia"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// Estados de presentación: "low" dispara el banner sutil (<20%), "critical"
// el banner urgente (<10%), "exhausted" el modal bloqueante (<=0%).
export const QUOTA_STATES = ["ok", "low", "critical", "exhausted"] as const;
export type QuotaState = (typeof QUOTA_STATES)[number];

export interface QuotaStatusDto {
  tier: PlanTier;
  /** 0-100, entero, nunca negativo. */
  percentRemaining: number;
  /** El objeto contable que se muestra primero: "te alcanza para ~N publicaciones más". */
  publicationsRemaining: number;
  /** ISO 8601 — cuándo renueva el ciclo vigente. */
  renewsAt: string;
  state: QuotaState;
}
