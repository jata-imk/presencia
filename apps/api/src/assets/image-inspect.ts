import sharp from "sharp";
import type { AssetUploadMimeType } from "@presencia/shared";

// Qué es de verdad un archivo que dice ser imagen. No se le cree al
// Content-Type del navegador ni a la extensión: sharp lo decodifica, y si no
// puede, no es una imagen que una red vaya a aceptar.

const MIME_BY_FORMAT: Record<string, AssetUploadMimeType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface InspectedImage {
  mimeType: AssetUploadMimeType;
  width: number;
  height: number;
}

export class InvalidImageError extends Error {}

export async function inspectImage(data: Uint8Array): Promise<InspectedImage> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(data).metadata();
  } catch (error) {
    throw new InvalidImageError("El archivo no es una imagen que se pueda leer", {
      cause: error,
    });
  }
  const mimeType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
  if (!mimeType || !metadata.width || !metadata.height) {
    throw new InvalidImageError(`Formato no admitido: ${metadata.format ?? "desconocido"}`);
  }
  // EXIF orientation 5-8 = la imagen se muestra girada 90°: el ancho que ve
  // el usuario es el alto que guarda el archivo.
  const rotated = (metadata.orientation ?? 1) >= 5;
  return {
    mimeType,
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}

export function extensionFor(mimeType: AssetUploadMimeType): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
}
