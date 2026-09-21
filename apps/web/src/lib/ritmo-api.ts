import type {
  RitmoHorariosDto,
  RitmoNarracionDto,
  RitmoMetaDto,
  RitmoResumenDto,
  SocialNetwork,
  TrendsDto,
  VentanaDeRedDto,
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

/** Solo las metas: lo que el Calendario necesita para su denominador. */
export function fetchMetas(signal?: AbortSignal): Promise<RitmoMetaDto[]> {
  return apiFetch<RitmoMetaDto[]>("/api/ritmo/objetivos", { signal });
}

/** Las mejores ventanas de un día, de todas las redes, en un solo viaje. */
export function fetchVentanas(diaSemana: number, signal?: AbortSignal): Promise<VentanaDeRedDto[]> {
  return apiFetch<VentanaDeRedDto[]>(`/api/ritmo/ventanas?diaSemana=${String(diaSemana)}`, {
    signal,
  });
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

/**
 * Pide la narración de hoy.
 *
 * POST y no GET aunque a veces solo devuelva lo guardado: la primera del día
 * llama al modelo y cobra, y un GET que cobra es un GET que un prefetch o un
 * reintento del navegador pueden disparar solos.
 */
export function pedirNarracion(signal?: AbortSignal): Promise<RitmoNarracionDto> {
  return apiFetch<RitmoNarracionDto>("/api/ritmo/narracion", { method: "POST", signal });
}
