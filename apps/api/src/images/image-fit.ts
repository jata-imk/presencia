import sharp from "sharp";
import type { ImageAspectRatio } from "@presencia/shared";

// Dejar la imagen en la proporción que se pidió (F10, ADR-025).
//
// gpt-image solo conoce tres tamaños: 4:5 le sale 2:3 (1024×1536), más alta de
// lo que el feed de Instagram muestra, que la recortaría a su manera. El
// adapter no recorta —decidir qué parte sobra es del producto—, así que se
// hace acá: un recorte centrado, sin reescalar. Gemini entrega la proporción
// exacta y pasa sin tocarse.

/** Diferencia que se tolera sin recortar: 928×1152 es "4:5" aunque no sea exacto. */
const TOLERANCE = 0.02;

function ratioOf(aspect: ImageAspectRatio): number {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  return w / h;
}

export async function fitToAspect(data: Uint8Array, aspect: ImageAspectRatio): Promise<Uint8Array> {
  const image = sharp(data);
  const { width, height } = await image.metadata();
  if (!width || !height) return data;
  const target = ratioOf(aspect);
  const actual = width / height;
  if (Math.abs(actual - target) / target <= TOLERANCE) return data;

  // Se recorta el lado que sobra y se deja el otro entero.
  const cropWidth = actual > target ? Math.round(height * target) : width;
  const cropHeight = actual > target ? height : Math.round(width / target);
  const left = Math.floor((width - cropWidth) / 2);
  const top = Math.floor((height - cropHeight) / 2);
  const cropped = await image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();
  return new Uint8Array(cropped);
}

/**
 * La proporción de la lista más cercana a la de una imagen: con qué
 * proporción se pide la edición de una foto que el usuario subió en 3:2.
 */
export function nearestAspect(
  width: number,
  height: number,
  options: readonly ImageAspectRatio[],
): ImageAspectRatio {
  const actual = width / height;
  let best = options[0]!;
  for (const option of options) {
    if (Math.abs(ratioOf(option) - actual) < Math.abs(ratioOf(best) - actual)) best = option;
  }
  return best;
}
