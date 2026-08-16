import type {
  PublicationCardDto,
  ScheduleCardBody,
  ScheduleGroupBody,
  ScheduleGroupResultItem,
} from "@presencia/shared";
import { apiFetch } from "./api.js";

// Un solo camino para programar (1 card o un grupo entero): siempre
// schedule-group, incluso para una sola card — evita mantener dos formas de
// leer la respuesta en ScheduleDrawer.
export function scheduleGroup(body: ScheduleGroupBody): Promise<ScheduleGroupResultItem[]> {
  return apiFetch<ScheduleGroupResultItem[]>("/api/cards/schedule-group", {
    method: "POST",
    body,
  });
}

export function cancelCardSchedule(cardId: string): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/cancel`, { method: "POST" });
}

/** Reprograma con los mismos parámetros que tenía — usado por "Deshacer" del toast de cancelación. */
export function rescheduleCard(
  cardId: string,
  body: ScheduleCardBody,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/schedule`, { method: "POST", body });
}

export function fetchScheduleConflicts(from: string, to: string): Promise<PublicationCardDto[]> {
  const params = new URLSearchParams({ from, to });
  return apiFetch<PublicationCardDto[]>(`/api/cards/conflicts?${params.toString()}`);
}
