import {
  ASSET_UPLOAD_MAX_BYTES,
  IMAGE_JOB_STALE_MS,
  type CardImageJob,
  formatBytes,
  isAssetUploadMimeType,
  type CardContent,
  type SocialNetwork,
} from "@presencia/shared";

/**
 * Por qué un archivo no se puede subir, o `null` si sí. Se revisa antes de
 * mandarlo para no hacer esperar una subida de 14 MB que la API va a
 * rechazar; la API revisa de nuevo, y es la que manda.
 */
export function imageFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!isAssetUploadMimeType(file.type)) {
    return "Ese archivo no es una imagen JPG, PNG o WebP.";
  }
  if (file.size > ASSET_UPLOAD_MAX_BYTES) {
    return `El límite es ${formatBytes(ASSET_UPLOAD_MAX_BYTES)}. Tu archivo pesa ${formatBytes(file.size)}. Prueba comprimirlo o sube uno más pequeño.`;
  }
  return null;
}

/** La imagen elegida de la card, si tiene. Hoy una sola: el carrusel no es de F10. */
export function selectedAssetId(content: CardContent): string | undefined {
  return content.assetIds[0];
}

/**
 * Qué le pasa a la publicación si no lleva imagen, dicho como es. Instagram
 * la exige (la API no deja programar sin ella); Facebook no, y sin imagen
 * publica solo el texto — antes la card decía "necesita" también para
 * Facebook, y era mentira.
 */
export function missingImageNote(network: SocialNetwork): string {
  if (network === "instagram") return "Instagram necesita una imagen para poder programar.";
  if (network === "facebook") return "Si no agregas una, se publicará solo el texto.";
  return "La imagen es opcional en esta red.";
}

/**
 * El trabajo de imagen como hay que mostrarlo AHORA. La API ya da por muerto
 * uno que lleva "generando" más de IMAGE_JOB_STALE_MS, pero solo cuando la card
 * se vuelve a pedir: si el worker murió a la mitad nadie escribe la card, el
 * stream no trae nada y el navegador se quedaría con los botones apagados.
 * Mismo corte, del lado del navegador.
 */
export function effectiveImageJob(job: CardImageJob | null, now: number): CardImageJob | null {
  if (job?.status !== "generating") return job;
  return now - Date.parse(job.startedAt) > IMAGE_JOB_STALE_MS ? { ...job, status: "failed" } : job;
}
