import type {
  LibraryAssetDetailDto,
  LibraryAssetDto,
  LibraryDeleteResultDto,
  LibraryPageDto,
  LibrarySummaryDto,
} from "@presencia/shared";
import { apiFetch } from "../api.js";
import { uploadRaw, type Upload } from "../attachments/upload.js";

// Los endpoints de Biblioteca (F12), tipados contra el contrato de shared
// (patrón de ritmo-api.ts). El archivo de cada imagen no pasa por aquí: se
// pide a `assetContentUrl` directo desde el `<img>`.

/**
 * Una página del listado. `search` es la consulta ya armada
 * (`queryString(toQuery(...))`), sin cursor; `cursor` pide la siguiente.
 */
export function fetchLibraryPage(
  search: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<LibraryPageDto> {
  const params = new URLSearchParams(search);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return apiFetch<LibraryPageDto>(query ? `/api/library?${query}` : "/api/library", { signal });
}

/** Los cuatro atajos del bento y el total (0 = Biblioteca vacía). */
export function fetchLibrarySummary(signal?: AbortSignal): Promise<LibrarySummaryDto> {
  return apiFetch<LibrarySummaryDto>("/api/library/summary", { signal });
}

/** Una imagen con su historial de versiones: el panel de detalle. */
export function fetchLibraryAsset(
  id: string,
  signal?: AbortSignal,
): Promise<LibraryAssetDetailDto> {
  return apiFetch<LibraryAssetDetailDto>(`/api/library/${encodeURIComponent(id)}`, { signal });
}

/**
 * Elimina una. Si está programada (o se está editando) la API responde 409
 * con el porqué y qué hacer, y llega como `ApiError` con ese mensaje.
 */
export function deleteLibraryAsset(id: string): Promise<void> {
  return apiFetch<void>(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Elimina varias: las bloqueadas se quedan y el resultado dice cuáles. */
export function deleteLibraryAssets(ids: string[]): Promise<LibraryDeleteResultDto> {
  return apiFetch<LibraryDeleteResultDto>("/api/library/delete", {
    method: "POST",
    body: { ids },
  });
}

/** Sube una imagen a Biblioteca, sin card ni chat. Un archivo por llamada. */
export function uploadToLibrary(
  file: File,
  onProgress: (percent: number) => void,
): Upload<LibraryAssetDto> {
  return uploadRaw<LibraryAssetDto>("/api/library", file, onProgress);
}
