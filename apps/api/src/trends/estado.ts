import type { TrendRefreshFailureDto } from "@presencia/shared";

// Qué le cuenta la pantalla sobre el último refresco que terminó mal.
//
// Puro y aparte por la misma razón que cobro.ts: es una decisión de producto
// —qué es noticia y qué ya no— y separarla la vuelve probable sin arrastrar
// env.ts.

export interface RefrescoLiquidado {
  outcome: string | null;
  settledAt: Date;
}

/**
 * El fallo que la pantalla todavía debe contar, o `null`.
 *
 * - `error` y `abandonado` se dicen igual: para el usuario, la búsqueda falló.
 * - `sin_resultados` se dice aparte: no falló nada, no había qué citar.
 * - `no_encolado` no: ese ya contestó un 503 en el momento del click.
 * - Una tanda generada DESPUÉS del fallo lo deja atrás: el barrido pudo traer
 *   tendencias buenas, y seguir diciendo "falló" sería mentir.
 */
export function falloVigente(
  ultimo: RefrescoLiquidado | null,
  tanda: { generatedAt: Date } | null,
): TrendRefreshFailureDto | null {
  if (!ultimo) return null;
  const motivo =
    ultimo.outcome === "error" || ultimo.outcome === "abandonado"
      ? "error"
      : ultimo.outcome === "sin_resultados"
        ? "sin_resultados"
        : null;
  if (!motivo) return null;
  if (tanda && tanda.generatedAt.getTime() > ultimo.settledAt.getTime()) return null;
  return { motivo, en: ultimo.settledAt.toISOString() };
}
