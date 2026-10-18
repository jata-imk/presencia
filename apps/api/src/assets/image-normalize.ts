import sharp from "sharp";
import { InvalidImageError } from "./image-inspect.js";

// F10.9: una imagen que sube el creator, lista para guardarse. Dos cosas:
//
// - **Sin metadata.** Las fotos del celular traen EXIF con la ubicación GPS;
//   eso no se guarda ni se manda a ningún proveedor. sharp tira toda la
//   metadata al recodificar (salvo que se le pida `keepMetadata`), así que
//   basta con pasar la imagen por él. La orientación EXIF se aplica antes
//   (`rotate()`): sin ella, una foto vertical quedaría acostada.
// - **Un tope de lado**, opcional: lo que se guarda (2048 px) y lo que viaja al
//   modelo (1568 px: ahí Anthropic deja de reescalar y una foto completa del
//   celular costaría varias veces más tokens sin leerse mejor).
//
// El formato se conserva (una captura sigue en PNG y su texto, nítido). Un GIF
// queda en PNG con su primer cuadro: ni el modelo ni las redes lo animan aquí.

export type NormalizedMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface NormalizedImage {
  data: Uint8Array;
  mimeType: NormalizedMimeType;
  width: number;
  height: number;
}

/** Calidad de JPEG y WebP al recodificar: alta, porque puede terminar publicada. */
const QUALITY = 90;

export async function normalizeImage(
  data: Uint8Array,
  options: { maxEdge?: number } = {},
): Promise<NormalizedImage> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(data).metadata());
  } catch (error) {
    throw new InvalidImageError("El archivo no es una imagen que se pueda leer", { cause: error });
  }

  // `animated: false` (el default) lee solo el primer cuadro de un GIF.
  let image = sharp(data).rotate();
  if (options.maxEdge) {
    image = image.resize({
      width: options.maxEdge,
      height: options.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  let mimeType: NormalizedMimeType;
  if (format === "jpeg") {
    image = image.jpeg({ quality: QUALITY });
    mimeType = "image/jpeg";
  } else if (format === "webp") {
    image = image.webp({ quality: QUALITY });
    mimeType = "image/webp";
  } else if (format === "png" || format === "gif") {
    image = image.png();
    mimeType = "image/png";
  } else {
    throw new InvalidImageError(`Formato no admitido: ${format ?? "desconocido"}`);
  }

  const { data: out, info } = await image.toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(out), mimeType, width: info.width, height: info.height };
}
