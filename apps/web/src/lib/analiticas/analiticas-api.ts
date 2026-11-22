import type {
  AnaliticasPublicacionesDto,
  AnaliticasRedesDto,
  AnaliticasResumenDto,
  PeriodoAnaliticas,
  SocialNetwork,
} from "@presencia/shared";
import { apiFetch } from "../api.js";

// Los endpoints de Analíticas (F12), tipados contra el contrato de shared.
// Cuatro rebanadas del mismo análisis del motor: la pantalla no calcula nada,
// solo pide y pinta (addendum F12 de ADR-022).

function query(periodo: PeriodoAnaliticas, red: SocialNetwork | null): string {
  return `periodo=${String(periodo)}${red ? `&red=${red}` : ""}`;
}

export function fetchResumen(
  periodo: PeriodoAnaliticas,
  red: SocialNetwork | null,
  signal?: AbortSignal,
): Promise<AnaliticasResumenDto> {
  return apiFetch<AnaliticasResumenDto>(`/api/analiticas/resumen?${query(periodo, red)}`, {
    signal,
  });
}

/** Siempre todas las redes: el filtro de red no aplica a una lista de redes. */
export function fetchRedes(
  periodo: PeriodoAnaliticas,
  signal?: AbortSignal,
): Promise<AnaliticasRedesDto> {
  return apiFetch<AnaliticasRedesDto>(`/api/analiticas/redes?${query(periodo, null)}`, { signal });
}

export function fetchPublicaciones(
  periodo: PeriodoAnaliticas,
  red: SocialNetwork | null,
  signal?: AbortSignal,
): Promise<AnaliticasPublicacionesDto> {
  return apiFetch<AnaliticasPublicacionesDto>(
    `/api/analiticas/publicaciones?${query(periodo, red)}`,
    { signal },
  );
}
