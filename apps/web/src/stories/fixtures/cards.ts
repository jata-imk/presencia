import type {
  CardContent,
  CardStatus,
  ImagesConfigDto,
  PublicationCardDto,
  SocialNetwork,
} from "@presencia/shared";
import type { CardToolPart } from "../../lib/chat-types.js";

// Cards de ejemplo para las historias (F10.8.3). La card viva va al store
// (`useCardsStore`), y el tool part del mensaje solo la nombra.

/** La imagen de ejemplo: el preview la sirve en /api/assets/<id>/content (staticDirs). */
export const IMAGEN_DEMO = "5b3f2c1e-8d4a-4f6b-9c2e-1a7d0e9b3f11";

const AHORA = "2026-10-11T18:00:00.000Z";

export const CONTENIDO = {
  instagram: {
    archetype: "visual_first",
    caption:
      "¿Queso de bola solo o con Nutella? En Mérida esta pregunta divide familias 🍫🧀 Cuéntanos tu combinación favorita.",
    hashtags: ["marquesitas", "merida", "yucatan"],
    assetIds: [],
  },
  linkedin: {
    archetype: "text_first",
    body: "Organizar una semana de contenido no es tener más ideas: es decidir cuándo grabas, cuándo editas y cuándo publicas.",
    hashtags: ["contenido", "productividad"],
    assetIds: [],
  },
  tiktok: {
    archetype: "video_script",
    hook: "Si nunca has probado una marquesita, este video es tu señal.",
    script: "Escena 1: la plancha caliente…",
    caption: "La marquesita perfecta existe y está en Mérida.",
    hashtags: ["marquesitas"],
    assetIds: [],
  },
} satisfies Record<string, CardContent>;

/** Una card viva; por default, borrador de Instagram sin imagen. */
export function card(id: string, over: Partial<PublicationCardDto> = {}): PublicationCardDto {
  const content = over.content ?? CONTENIDO.instagram;
  return {
    id,
    chatId: "chat-demo",
    archetype: content.archetype,
    network: "instagram",
    status: "draft",
    content,
    groupId: "grupo-demo",
    scheduledAt: null,
    publishedAt: null,
    socialAccountId: null,
    postUrl: null,
    errorMessage: null,
    updatedAt: AHORA,
    imageJob: null,
    ...over,
  };
}

/** El tool part con que el chat nombra una card ya creada. */
export function cardPart(
  cardId: string,
  network: SocialNetwork,
  content: CardContent,
  status: CardStatus = "draft",
): CardToolPart {
  return {
    type: "tool-crear_borrador_visual",
    toolCallId: `t-${cardId}`,
    state: "output-available",
    input: { network },
    output: { cardId, network, status, content },
  } as unknown as CardToolPart;
}

/** Una tool que todavía escribe su borrador (la card "naciendo"). */
export function cardPartNaciendo(network: SocialNetwork): CardToolPart {
  return {
    type: "tool-crear_borrador_visual",
    toolCallId: `t-naciendo-${network}`,
    state: "input-streaming",
    input: { network },
  } as unknown as CardToolPart;
}

/** Una tool que falló al crear la card. */
export function cardPartConError(): CardToolPart {
  return {
    type: "tool-crear_borrador_visual",
    toolCallId: "t-error",
    state: "output-error",
    input: { network: "instagram" },
    errorText: "El texto pasa de 2,200 caracteres.",
  } as unknown as CardToolPart;
}

/** Lo que responde GET /api/images/config en las historias. */
export const IMAGES_CONFIG: ImagesConfigDto = {
  generatePercent: 4.7,
  editPercent: 4.7,
  batchPercents: [4.7, 9.4, 14.1, 18.8, 23.5],
  generatorCount: 2,
  generatorStrengths: ["Personas y realismo", "Ilustración"],
  defaultStyle: "foto",
};
