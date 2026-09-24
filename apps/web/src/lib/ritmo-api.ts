import type {
  RitmoHorariosDto,
  RitmoNarracionDto,
  RitmoMetaDto,
  RitmoResumenDto,
  SocialNetwork,
  TrendRefreshStateDto,
  TrendSettingsDto,
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

/**
 * Adelanta el refresco de tendencias.
 *
 * Devuelve el estado del botón, no tendencias: la búsqueda tarda cerca de un
 * minuto y corre en la cola. Quien llama vuelve a pedir el GET mientras
 * `enCurso` siga en true.
 */
export function solicitarRefrescoDeTendencias(): Promise<TrendRefreshStateDto> {
  return apiFetch<TrendRefreshStateDto>("/api/ritmo/tendencias/refresco", { method: "POST" });
}

export function fetchAjustesDeTendencias(signal?: AbortSignal): Promise<TrendSettingsDto> {
  return apiFetch<TrendSettingsDto>("/api/ritmo/tendencias/ajustes", { signal });
}

/** Guarda la personalización ENTERA: la lista de fuentes que llega es la que queda. */
export function saveAjustesDeTendencias(
  ajustes: Pick<TrendSettingsDto, "fuentes" | "prompt" | "excluye" | "langs">,
): Promise<TrendSettingsDto> {
  return apiFetch<TrendSettingsDto>("/api/ritmo/tendencias/ajustes", {
    method: "PUT",
    body: ajustes,
  });
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
