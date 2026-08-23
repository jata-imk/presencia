import type { CardContent } from "@presencia/shared";

/**
 * El texto de una card para superficies compactas: celda del calendario,
 * mini-card del panel del día, bandeja de borradores.
 *
 * No es `summarizeCardContent` de @presencia/shared: aquella antepone el
 * arquetipo ("post de texto — …") porque su destinatario es el MODELO en la
 * dieta de contexto de F4.5, donde saber de qué tipo es la card importa. En
 * una píldora de 180px ese prefijo se come el ancho útil y le dice al
 * usuario algo que el logo de la red y el ícono ya comunican.
 *
 * Tampoco trunca: de eso se encarga el CSS (`truncate` / `line-clamp`), que
 * sabe el ancho real. El texto completo va en el `title`.
 */
export function cardPreviewText(content: CardContent): string {
  switch (content.archetype) {
    case "visual_first":
      return content.caption;
    case "video_script":
      return content.hook;
    case "text_first":
      return content.body;
  }
}
