import type { CardContent, SocialNetwork } from "./publication.js";

/**
 * Aplana una CardContent al único campo de texto que aceptan los
 * proveedores. Vive en shared porque tres lugares lo necesitan idéntico:
 * los dos adapters de publicación (PostFast lo manda como `content`,
 * Upload-Post como `title`) y la vista previa del navegador (F10.5), que
 * cuenta caracteres contra el límite de la red — si contara otro texto que
 * el que se publica, el aviso de "te pasas" mentiría.
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

/**
 * Cuántos caracteres acepta cada red en el texto de un post (F10.5). Antes
 * solo existían LinkedIn, X y Threads, dentro de TextCardBody.
 *
 * - Instagram: 2,200 en el caption.
 * - Facebook: 63,206; en la práctica no se alcanza.
 * - TikTok: 2,200 en la descripción.
 * - YouTube: 5,000 en la descripción.
 * - LinkedIn: 3,000. X: 280 (cuentas sin Premium). Threads: 500.
 */
export const NETWORK_TEXT_LIMITS: Record<SocialNetwork, number> = {
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  youtube: 5000,
  linkedin: 3000,
  x: 280,
  threads: 500,
};

/**
 * El nombre de cada red en español. Vivía en la web (lib/network-labels.ts);
 * en F10.5 lo necesita también la API, para el prompt de reescritura.
 */
export const NETWORK_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
  x: "X",
};
