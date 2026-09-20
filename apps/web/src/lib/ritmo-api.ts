import type {
  RitmoHorariosDto,
  RitmoResumenDto,
  SocialNetwork,
  TrendsDto,
} from "@presencia/shared";
import { apiFetch } from "./api.js";

// Los endpoints de Ritmo, tipados contra el contrato de shared (patrón de
// cards-api.ts).
//
// Están separados en tres llamadas y no en una porque fallan por su cuenta:
// que la fuente de tendencias se caiga no puede dejar sin heatmap al usuario.
// La pantalla pinta lo que sí llegó.

export function fetchResumen(signal?: AbortSignal): Promise<RitmoResumenDto> {
  return apiFetch<RitmoResumenDto>("/api/ritmo/resumen", { signal });
}

export function fetchHorarios(
  network: SocialNetwork,
  signal?: AbortSignal,
): Promise<RitmoHorariosDto> {
  return apiFetch<RitmoHorariosDto>(`/api/ritmo/horarios?network=${network}`, { signal });
}

export function fetchTendencias(signal?: AbortSignal): Promise<TrendsDto> {
  return apiFetch<TrendsDto>("/api/ritmo/tendencias", { signal });
}

export function saveMetaSemanal(network: SocialNetwork, meta: number): Promise<RitmoResumenDto> {
  return apiFetch<RitmoResumenDto>("/api/ritmo/objetivos", {
    method: "PATCH",
    body: { network, meta },
  });
}
