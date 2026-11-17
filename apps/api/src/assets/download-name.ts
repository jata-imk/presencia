import type { AssetMetadata, AssetRow } from "./assets.repository.js";
import { extensionFor } from "./image-inspect.js";

/**
 * Solo extensiones de imagen: quitar "cualquier cosa después del último punto"
 * se comía parte de nombres como "Captura a las 10.30.15" o "logo.v2".
 */
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;

/**
 * El nombre con el que se guarda una imagen descargada (F12, "Descargar" de
 * Biblioteca): el que traía al subirse o, si la dibujó un generador, uno
 * armado con su id.
 *
 * La extensión sale del archivo guardado y no del nombre original: una foto
 * `IMG_4821.heic` que se recodificó a JPEG se baja como `.jpg`, que es lo que
 * de verdad contiene.
 */
export function downloadNameFor(row: Pick<AssetRow, "id" | "mimeType" | "metadata">): string {
  const extension = extensionFor(row.mimeType as Parameters<typeof extensionFor>[0]);
  const original = (row.metadata as AssetMetadata).originalName?.trim();
  const base = original ? original.replace(IMAGE_EXTENSION, "") : "";
  return `${base || `presencia-${row.id.slice(0, 8)}`}.${extension}`;
}
