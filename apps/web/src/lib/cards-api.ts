import type {
  CardContentChangeDto,
  CardImageVersionDto,
  CardVersionDto,
  UpdateCardContentBody,
  EditCardImageBody,
  GenerateCardImageBody,
  CardStatus,
  PublicationCardDto,
  ScheduleCardBody,
  ScheduleGroupBody,
  ScheduleGroupResultItem,
  SocialNetwork,
  ImageAspectRatio,
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
export async function uploadCardImage(
  cardId: string,
  file: File,
  /** F10.6: el slide del carrusel al que va. */
  slideId?: string,
): Promise<PublicationCardDto> {
  const query = slideId ? `?slideId=${encodeURIComponent(slideId)}` : "";
  const res = await fetch(`/api/cards/${cardId}/assets${query}`, {
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

/** "Generar imagen": la API encola y devuelve la card en "generando". */
export function generateCardImage(
  cardId: string,
  body: GenerateCardImageBody,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/images`, { method: "POST", body });
}

/** Elegir otra de las imágenes de la card (una variante, una versión anterior). */
export function selectCardImage(
  cardId: string,
  assetId: string,
  slideId?: string,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/image`, {
    method: "PATCH",
    body: slideId ? { assetId, slideId } : { assetId },
  });
}

// ── F10.6: slides del carrusel ─────────────────────────────────────────

export function addCardSlide(cardId: string, imagePrompt?: string): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/slides`, {
    method: "POST",
    body: imagePrompt ? { imagePrompt } : {},
  });
}

export function updateCardSlide(
  cardId: string,
  slideId: string,
  imagePrompt: string,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/slides/${slideId}`, {
    method: "PATCH",
    body: { imagePrompt },
  });
}

export function deleteCardSlide(cardId: string, slideId: string): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/slides/${slideId}`, {
    method: "DELETE",
  });
}

export function reorderCardSlides(cardId: string, slideIds: string[]): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/slides/order`, {
    method: "PATCH",
    body: { slideIds },
  });
}

export function setCardSlidesAspect(
  cardId: string,
  aspectRatio: ImageAspectRatio,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/slides/aspect`, {
    method: "PATCH",
    body: { aspectRatio },
  });
}

/** "Más cálida", "sin gente": edita la imagen elegida. Devuelve la card generando. */
export function editCardImage(
  cardId: string,
  body: EditCardImageBody,
): Promise<PublicationCardDto> {
  return apiFetch<PublicationCardDto>(`/api/cards/${cardId}/images/edit`, { method: "POST", body });
}

/** Todas las imágenes que tuvo la card, de la más vieja a la más nueva. */
export function fetchCardImageVersions(cardId: string): Promise<CardImageVersionDto[]> {
  return apiFetch<CardImageVersionDto[]>(`/api/cards/${cardId}/images`);
}

export function updateAssetAlt(
  assetId: string,
  alt: string,
): Promise<{ assetId: string; alt: string }> {
  return apiFetch(`/api/assets/${assetId}`, { method: "PATCH", body: { alt } });
}

/** F10.5: autoguardado del texto de la card. La API decide si es versión nueva. */
export function editCardContent(
  cardId: string,
  body: UpdateCardContentBody,
): Promise<CardContentChangeDto> {
  return apiFetch<CardContentChangeDto>(`/api/cards/${cardId}/content`, { method: "PATCH", body });
}

/** El historial del texto de la card, de la más vieja a la más nueva. */
export function fetchCardVersions(cardId: string): Promise<CardVersionDto[]> {
  return apiFetch<CardVersionDto[]>(`/api/cards/${cardId}/versions`);
}

/**
 * F10.5 PR4: pedirle un cambio a la IA sobre la card. Tarda lo que una
 * respuesta del chat; `signal` es el botón "Detener" (sin respuesta no hay
 * versión ni cobro).
 */
export function rewriteCard(
  cardId: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<CardContentChangeDto> {
  return apiFetch<CardContentChangeDto>(`/api/cards/${cardId}/rewrite`, {
    method: "POST",
    body: { instruction },
    signal,
  });
}

/**
 * "Detener", explícito. Cancelar el fetch no alcanza: detrás de un proxy la
 * conexión del servidor puede seguir abierta y la reescritura terminaría
 * (y se cobraría) igual.
 */
export function cancelRewrite(cardId: string): Promise<void> {
  return apiFetch<void>(`/api/cards/${cardId}/rewrite`, { method: "DELETE" });
}

/** Restaurar una versión: vuelve como una nueva. */
export function restoreCardVersion(cardId: string, n: number): Promise<CardContentChangeDto> {
  return apiFetch<CardContentChangeDto>(`/api/cards/${cardId}/versions/${String(n)}/restore`, {
    method: "POST",
  });
}
