import type { ImageAspectRatio } from "../../src/images/image-provider.js";
import { composeEditPrompt, composeImagePrompt } from "../../src/images/image-prompt.js";

// Los prompts del bake-off (ADR-025): escritos como los escribiría el chat
// para un creator del sureste. Aparte de run.ts para que el caché (cache.ts)
// y cualquier script de mantenimiento calculen la misma huella.

export interface BakeoffPrompt {
  id: string;
  aspectRatio: ImageAspectRatio;
  /** Lo que escribiría el chat (el "qué se ve"); se compone como en producción. */
  description: string;
  /**
   * Se manda tal cual, sin componer. Solo las pruebas de texto: el prompt
   * compuesto siempre pide "sin texto", y lo que se mide ahí es si el
   * generador escribe bien cuando el creator lo pide.
   */
  raw?: boolean;
  /** Si está, se edita la primera variante que produjo ese prompt. */
  editOf?: string;
  /** Qué mirar en este prompt al calificar. */
  mirar: string;
}

export const PROMPTS: BakeoffPrompt[] = [
  {
    id: "marquesitas",
    aspectRatio: "4:5",
    description:
      "Un puesto de marquesitas en el Paseo de Montejo de Mérida al atardecer, con el vendedor preparando una marquesita con queso de bola.",
    mirar: "¿Se reconoce el Paseo de Montejo? ¿La marquesita es una marquesita?",
  },
  {
    id: "cafe-centro",
    aspectRatio: "4:5",
    description:
      "Taza de café de olla sobre una mesa de madera en una cafetería del centro histórico de Mérida, paredes de colores y mosaico de pasta al fondo.",
    mirar: "Mosaico de pasta y paredes del centro; café de olla creíble.",
  },
  {
    id: "nutriologa",
    aspectRatio: "1:1",
    description:
      "Plato de desayuno saludable mexicano: chilaquiles verdes horneados con pollo, aguacate y frijoles, vista cenital, para una nutrióloga.",
    mirar: "Comida mexicana real, no genérica; vista cenital.",
  },
  {
    id: "inmobiliaria",
    aspectRatio: "4:5",
    description:
      "Fachada de una casa colonial restaurada en el barrio de Santiago en Mérida, con puerta de madera y herrería, cielo despejado.",
    mirar: "Arquitectura yucateca, no colonial genérica.",
  },
  {
    id: "gym",
    aspectRatio: "4:5",
    description:
      "Mujer de 30 años entrenando con mancuernas en un gimnasio pequeño de barrio, energía y esfuerzo, sin marcas de ropa visibles.",
    mirar: "Persona creíble (manos, cara); sin logos en la ropa.",
  },
  {
    id: "linkedin-equipo",
    aspectRatio: "1:1",
    description:
      "Equipo pequeño de una agencia de marketing en Monterrey conversando alrededor de una laptop en una oficina luminosa.",
    mirar: "Personas naturales, sin logos en la laptop.",
  },
  {
    id: "x-cenote",
    aspectRatio: "16:9",
    description:
      "Cenote de Yucatán visto desde arriba con agua turquesa y raíces colgando, una persona flotando.",
    mirar: "Cenote real, proporción 16:9.",
  },
  {
    id: "tiendita-sin-logos",
    aspectRatio: "4:5",
    // F10.7: el prompt que más tienta a dibujar marcas (refrescos, botanas).
    description:
      "Refrigerador de refrescos y estante de botanas en una tiendita de la esquina en Mérida, luz de la tarde entrando por la puerta.",
    mirar: "¿Metió marcas reconocibles? Eso descalifica (así cayó Flash Lite en F10).",
  },
  {
    id: "texto-en-imagen",
    aspectRatio: "1:1",
    raw: true,
    // Control de F10: pide texto exacto en mayúsculas.
    description:
      "Cartel de promoción de una taquería que diga exactamente 'MARTES DE 2X1 EN TACOS DE COCHINITA', estilo cartel pintado a mano mexicano.",
    mirar: "¿El texto dice exactamente eso, sin letras de más ni de menos?",
  },
  {
    id: "pizarron-espanol",
    aspectRatio: "4:5",
    raw: true,
    // F10.7: acentos y signos, que es donde fallan.
    description:
      "Pizarrón de gis en la entrada de un puesto de marquesitas que diga exactamente: 'Marquesitas de cajeta y queso de bola · 2×1 los martes'. Fotografía natural, luz cálida, Mérida.",
    mirar: "Acentos, la ×, el punto medio; sin palabras inventadas.",
  },
  {
    id: "marquesitas-calida",
    aspectRatio: "4:5",
    editOf: "marquesitas",
    description:
      "Hazla más cálida y quita a las personas del fondo; conserva el puesto y la composición.",
    mirar: "Edición fiel: misma escena, más cálida, sin gente al fondo.",
  },
  {
    id: "cafe-minimalista",
    aspectRatio: "4:5",
    editOf: "cafe-centro",
    description:
      "Cambia el fondo por una pared lisa color terracota, estilo minimalista; conserva la taza.",
    mirar: "Edición fiel: la misma taza, fondo terracota liso.",
  },
];

export function promptFor(p: BakeoffPrompt): string {
  if (p.raw) return p.description;
  return p.editOf ? composeEditPrompt(p.description) : composeImagePrompt(p.description, null);
}
