// El prompt que de verdad se le manda al generador (F10, decisión 4 del plan).
//
// Lo que escribió el chat (o el usuario) describe QUÉ dibujar. Esto le suma
// dos cosas que el usuario no debería tener que repetir en cada imagen: para
// quién es —el nicho de su Voz de marca— y un estilo por defecto. El estilo va
// condicionado: si la descripción pide otro ("estilo ilustración"), manda la
// descripción, que es lo que el usuario sí escribió a propósito.

/**
 * El estilo cuando nadie pidió otro. "Sin texto" no es gusto: los generadores
 * escriben mal y el texto del post vive en el caption (bake-off de ADR-025).
 * "Sin logotipos" es derechos: una imagen que el creator publica con la marca
 * de otro es un problema suyo que nosotros le causamos.
 */
export const DEFAULT_IMAGE_STYLE =
  "Fotografía natural y realista, con luz cálida, ambientada en México. " +
  "Sin texto, letras, marcas de agua ni logotipos dentro de la imagen.";

export interface VoiceForImage {
  niche: string[];
  vertical: string | null;
}

export function composeImagePrompt(description: string, voice: VoiceForImage | null): string {
  const parts = [description.trim()];
  const niche = voice?.niche.filter((n) => n.trim().length > 0) ?? [];
  if (niche.length > 0) {
    parts.push(`Es para una publicación de un creador de contenido de ${niche.join(", ")}.`);
  }
  parts.push(`Si la descripción no pide otro estilo: ${DEFAULT_IMAGE_STYLE}`);
  return parts.join("\n\n");
}

/**
 * El prompt de una edición ("más cálida", "sin gente"). Va con la imagen
 * elegida como referencia, y lo que más importa es lo que NO se pide: sin
 * esa cola, los generadores tienden a rehacer la escena entera y la edición
 * deja de parecerse a la foto que el usuario quería ajustar (bake-off de
 * ADR-025: con ella, Gemini conservó composición y rostro).
 */
export function composeEditPrompt(instruction: string): string {
  return (
    `${instruction.trim()}\n\n` +
    "Conserva todo lo que no se pidió cambiar: la composición, el encuadre y el sujeto. " +
    "Sin texto, letras ni logotipos nuevos."
  );
}
