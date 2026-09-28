// F10: los archivos de Biblioteca (ADR-011). Constantes compartidas porque
// las valida el navegador ANTES de subir —para decirle al usuario que su
// archivo no entra sin hacerle esperar la subida— y la API al recibir, que es
// la que manda.

/**
 * 10 MB: el límite más chico entre los proveedores de publicación (PostFast
 * acepta 10 MB por imagen en X; Upload-Post, 20 MB). Un tope más alto dejaría
 * subir imágenes que después no se pueden publicar.
 */
export const ASSET_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Los formatos que aceptan todas las redes de imagen a la vez. */
export const ASSET_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AssetUploadMimeType = (typeof ASSET_UPLOAD_MIME_TYPES)[number];

export function isAssetUploadMimeType(value: string): value is AssetUploadMimeType {
  return (ASSET_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

/** La URL que sirve un asset. Relativa: web y API comparten origen (ADR-020). */
export function assetContentUrl(assetId: string): string {
  return `/api/assets/${assetId}/content`;
}

/** "14 MB", "850 KB": para el mensaje de archivo demasiado grande. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.ceil(bytes / (1024 * 1024))} MB`;
  return `${Math.max(Math.ceil(bytes / 1024), 1)} KB`;
}
