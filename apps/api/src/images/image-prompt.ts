import { imageStyleDef, type ImageStyle } from "@presencia/shared";

// El prompt que de verdad se le manda al generador (F10, decisión 4 del plan).
//
// Lo que escribió el chat (o el usuario) describe QUÉ dibujar. Esto le suma lo
// que el usuario no debería tener que repetir en cada imagen: para quién es
// —el nicho de su Voz de marca—, el encuadre seguro y el estilo.
//
// F10.6: el estilo ya no es uno fijo. Sale del catálogo (image-styles.ts): el
// que se eligió para esta imagen o, si no, el de la Voz de marca. Sigue
// condicionado: si la descripción pide otro ("estilo acuarela"), manda la
// descripción, que es lo que el usuario sí escribió a propósito.
//
// El estilo va PRIMERO. Al final, Gemini lo perdía contra la escena: "un café
// en el centro de Mérida" salía foto aunque se pidiera 3D o minimalista (las
// imágenes de ejemplo de Configuración lo mostraron en 2 de 8 estilos). Con
// el estilo arriba y la descripción marcada como "qué se ve", la escena deja
// de decidir cómo se dibuja.

/**
 * Encuadre completo, siempre. Algunos generadores entregan otra proporción que
 * la pedida y se recorta al guardar (ADR-025), y aun sin recorte un prompt
 * cargado tiende a sacar el sujeto o el texto por el borde (QA de F10: una
 * tira de paneles cortada a los dos lados). Pedir margen hace que lo que se
 * recorte sea fondo.
 */
export const SAFE_FRAMING =
  "Encuadre completo: nada importante tocando o saliendo por los bordes; deja margen alrededor del sujeto y de cualquier texto, con lo importante al centro.";

/**
 * Lo que va con CUALQUIER estilo. "Sin texto" no es gusto: los generadores
 * escriben mal y el texto del post vive en el caption (bake-off de ADR-025).
 * "Sin logotipos" es derechos: una imagen que el creator publica con la marca
 * de otro es un problema suyo que nosotros le causamos. Antes vivía pegado al
 * estilo fotográfico; separado, un estilo nuevo no puede olvidarlo.
 */
export const NO_TEXT_NO_LOGOS =
  "Sin texto, letras, marcas de agua ni logotipos dentro de la imagen.";

/** Cómo abre el prompt: el estilo, salvo que la descripción pida otro. */
export const STYLE_LEAD = "Estilo de la imagen (salvo que la descripción de abajo pida otro):";

export interface VoiceForImage {
  niche: string[];
  vertical: string | null;
  /** F10.6: el estilo por defecto del creator; null = Fotográfico natural. */
  imageStyle?: string | null;
}

export function composeImagePrompt(
  description: string,
  voice: VoiceForImage | null,
  /** El estilo de ESTA imagen (chip del composer); sin él, el de la voz. */
  style?: ImageStyle,
): string {
  const def = imageStyleDef(style ?? (voice?.imageStyle as ImageStyle | null | undefined));
  const parts = [
    `${STYLE_LEAD} ${def.prompt}`,
    `Qué se ve (la escena, no el estilo): ${description.trim()}`,
  ];
  const niche = voice?.niche.filter((n) => n.trim().length > 0) ?? [];
  if (niche.length > 0) {
    parts.push(`Es para una publicación de un creador de contenido de ${niche.join(", ")}.`);
  }
  parts.push(SAFE_FRAMING);
  parts.push(NO_TEXT_NO_LOGOS);
  return parts.join("\n\n");
}

/**
 * El prompt de una edición ("más cálida"). Va con la imagen elegida como
 * referencia, y lo que más importa es lo que NO se pide: sin esa cola, los
 * generadores tienden a rehacer la escena entera y la edición deja de
 * parecerse a la foto que el usuario quería ajustar (bake-off de ADR-025: con
 * ella, Gemini conservó composición y rostro). No lleva estilo: el de la
 * imagen de partida es el que se conserva.
 */
export function composeEditPrompt(instruction: string): string {
  return (
    `${instruction.trim()}\n\n` +
    "Conserva todo lo que no se pidió cambiar: la composición, el encuadre y el sujeto. " +
    "Sin texto, letras ni logotipos nuevos.\n\n" +
    SAFE_FRAMING
  );
}
