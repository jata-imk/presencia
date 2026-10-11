import {
  CARD_ARCHETYPE_TOOLS,
  NETWORKS_BY_ARCHETYPE,
  type CardContent,
  type CardStatus,
  type ImagesConfigDto,
  type PublicationArchetype,
  type PublicationCardDto,
  type SocialNetwork,
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

/** La tool real de cada arquetipo: la misma que emite el chat (crear_borrador_*). */
function toolType(archetype: PublicationArchetype): CardToolPart["type"] {
  const def = CARD_ARCHETYPE_TOOLS.find((d) => d.archetype === archetype);
  if (!def) throw new Error(`Sin tool para el arquetipo ${archetype}`);
  return `tool-${def.toolName}`;
}

function archetypeOf(network: SocialNetwork): PublicationArchetype {
  const entry = Object.entries(NETWORKS_BY_ARCHETYPE).find(([, redes]) =>
    (redes as readonly string[]).includes(network),
  );
  if (!entry) throw new Error(`Sin arquetipo para ${network}`);
  return entry[0] as PublicationArchetype;
}

// Ids distintos por llamada: dos tools iguales en un mensaje no comparten key.
let siguiente = 0;
const toolCallId = (prefijo: string) => `t-${prefijo}-${String(++siguiente)}`;

/** El tool part con que el chat nombra una card ya creada. */
export function cardPart(
  cardId: string,
  network: SocialNetwork,
  content: CardContent,
  status: CardStatus = "draft",
): CardToolPart {
  return {
    type: toolType(content.archetype),
    toolCallId: toolCallId(cardId),
    state: "output-available",
    input: { network },
    output: { cardId, network, status, content },
  };
}

/** Una tool que todavía escribe su borrador (la card "naciendo"). */
export function cardPartNaciendo(network: SocialNetwork): CardToolPart {
  return {
    type: toolType(archetypeOf(network)),
    toolCallId: toolCallId(`naciendo-${network}`),
    state: "input-streaming",
    input: { network },
  };
}

/** Una tool que falló al crear la card. */
export function cardPartConError(network: SocialNetwork = "instagram"): CardToolPart {
  return {
    type: toolType(archetypeOf(network)),
    toolCallId: toolCallId("error"),
    state: "output-error",
    input: { network },
    errorText: "El texto pasa de 2,200 caracteres.",
  };
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
