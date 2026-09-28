import type {
  CardStatus,
  PublicationCardDto,
  ScheduleCardBody,
  ScheduleGroupBody,
  ScheduleGroupResultItem,
  SocialNetwork,
} from "@presencia/shared";
import { ApiError, apiFetch } from "./api.js";

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

// ── F10 (imagen de la card) ───────────────────────────────────────────

/**
 * "Subir propia": el archivo va como body crudo, no como multipart ni JSON
 * (por eso no pasa por `apiFetch`, que serializa a JSON). El nombre viaja en
 * un header, codificado porque un header no admite acentos. Devuelve la card
 * ya con la imagen elegida.
 */
export async function uploadCardImage(cardId: string, file: File): Promise<PublicationCardDto> {
  const res = await fetch(`/api/cards/${cardId}/assets`, {
    method: "POST",
    headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(
      parsed?.message ?? "No se pudo subir la imagen. Inténtalo de nuevo.",
      res.status,
      parsed,
    );
  }
  return (await res.json()) as PublicationCardDto;
}
