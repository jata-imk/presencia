import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { ChatUIMessage } from "../../lib/chat-types.js";
import { card, cardPart, cardPartNaciendo, CONTENIDO } from "../../stories/fixtures/cards.js";
import { RESPUESTA_PARCIAL } from "../../stories/fixtures/chat.js";
import { AssistantMessage } from "./AssistantMessage.js";

// Una respuesta con cards: texto, línea de pasos y el grupo de borradores. Las
// cards vivas se siembran en el store (`parameters.cards`).

const IG = "card-ig";
const LI = "card-li";
const TT = "card-tt";

function respuesta(parts: unknown[]): ChatUIMessage {
  return { id: "respuesta-demo", role: "assistant", parts } as ChatUIMessage;
}

const TEXTO = {
  type: "text",
  text: "Listo: preparé 3 borradores con el mismo ángulo, adaptado a cada red.",
  state: "done",
};

const meta = {
  title: "Chat/Respuesta con cards",
  component: AssistantMessage,
  args: {
    message: respuesta([
      { type: "step-start" },
      TEXTO,
      cardPart(IG, "instagram", CONTENIDO.instagram),
      cardPart(LI, "linkedin", CONTENIDO.linkedin),
      cardPart(TT, "tiktok", CONTENIDO.tiktok),
    ]),
    chatId: "chat-demo",
    isLast: true,
    streamingNow: false,
    canRegenerate: true,
    onRegenerate: fn(),
  },
  parameters: {
    cards: [
      card(IG),
      card(LI, { network: "linkedin", content: CONTENIDO.linkedin }),
      card(TT, { network: "tiktok", content: CONTENIDO.tiktok }),
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-[732px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TresBorradores: Story = { name: "Tres borradores" };

export const UnBorrador: Story = {
  args: { message: respuesta([TEXTO, cardPart(IG, "instagram", CONTENIDO.instagram)]) },
};

/** Mientras llega: la primera card ya nació, las otras se están escribiendo. */
export const Llegando: Story = {
  args: {
    message: respuesta([
      {
        type: "text",
        text: "Listo: preparé 3 borradores con el mismo ángulo, adaptado a cada",
        state: "streaming",
      },
      cardPart(IG, "instagram", CONTENIDO.instagram),
      cardPartNaciendo("linkedin"),
      cardPartNaciendo("tiktok"),
    ]),
    streamingNow: true,
    canRegenerate: false,
  },
};

/**
 * Se detuvo después de crear una card y antes de escribir texto (F10.8.2). Una
 * tool que quedó a medias no se pinta: CardBlock la oculta al terminar el turno.
 */
export const DetenidaConCards: Story = {
  name: "Detenida con cards (sin texto)",
  args: {
    message: respuesta([cardPart(IG, "instagram", CONTENIDO.instagram)]),
    canRegenerate: false,
  },
};

export const DetenidaConTexto: Story = {
  name: "Detenida con texto",
  args: {
    message: respuesta([{ type: "text", text: RESPUESTA_PARCIAL, state: "done" }]),
    canRegenerate: false,
  },
  parameters: { cards: [] },
};
