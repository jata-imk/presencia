import type { CardContent } from "@presencia/shared";

/**
 * Aplana una CardContent al único campo de texto que aceptan los
 * proveedores. Vive aparte de los adapters porque los dos lo necesitan
 * idéntico: PostFast lo manda como `content`, Upload-Post como `title`
 * (que su doc describe como "default text content for the post").
 *
 * Los hashtags van al final y separados por una línea en blanco — es la
 * convención de las redes que soportamos, y mantenerla acá evita que cada
 * adapter invente la suya.
 */
export function buildPostText(content: CardContent): string {
  const hashtags = content.hashtags.map((tag) => `#${tag}`).join(" ");
  const body =
    content.archetype === "visual_first"
      ? content.caption
      : content.archetype === "video_script"
        ? `${content.hook}\n\n${content.script}\n\n${content.caption}`
        : content.body;
  return hashtags ? `${body}\n\n${hashtags}` : body;
}
