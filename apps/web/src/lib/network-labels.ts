import type { SocialNetwork } from "@presencia/shared";

// Fuente única de las etiquetas en español de cada red — antes duplicado
// entre canales.tsx y las piezas de F6 (drawer, toolbar de la card).
export const NETWORK_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
  x: "X",
};
