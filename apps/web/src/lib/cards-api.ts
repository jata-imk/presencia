import type {
  CardStatus,
  PublicationCardDto,
  ScheduleCardBody,
  ScheduleGroupBody,
  ScheduleGroupResultItem,
  SocialNetwork,
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

// ── F7 (Calendario) ───────────────────────────────────────────────────

export interface CalendarFilters {
  status?: CardStatus[];
  network?: SocialNetwork[];
  folderId?: string;
}

/**
 * Todo lo que cae en el rango visible, en cualquier estado. No confundir con
 * `fetchScheduleConflicts` de arriba: ese endpoint devuelve solo `scheduled`
 * y existe para los markers del ScheduleDrawer.
 *
 * Las listas viajan separadas por coma (`?status=draft,scheduled`), que es
 * una de las tres formas que acepta `listCardsQuerySchema`.
 */
export function fetchCardsInRange(
  from: Date,
  to: Date,
  filters: CalendarFilters = {},
  signal?: AbortSignal,
): Promise<PublicationCardDto[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.network?.length) params.set("network", filters.network.join(","));
  if (filters.folderId) params.set("folderId", filters.folderId);
  return apiFetch<PublicationCardDto[]>(`/api/cards?${params.toString()}`, { signal });
}

/** Borradores sin fecha — la bandeja del panel izquierdo (F7 PR3). */
export function fetchDraftCards(signal?: AbortSignal): Promise<PublicationCardDto[]> {
  return apiFetch<PublicationCardDto[]>("/api/cards/drafts", { signal });
}
