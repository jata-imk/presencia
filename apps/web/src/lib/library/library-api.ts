import type { LibraryAssetDto, LibraryPageDto, LibrarySummaryDto } from "@presencia/shared";
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

/** Sube una imagen a Biblioteca, sin card ni chat. Un archivo por llamada. */
export function uploadToLibrary(
  file: File,
  onProgress: (percent: number) => void,
): Upload<LibraryAssetDto> {
  return uploadRaw<LibraryAssetDto>("/api/library", file, onProgress);
}
