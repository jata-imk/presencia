import type { Meta, StoryObj } from "@storybook/react-vite";
import { RESPUESTA, RESPUESTA_PARCIAL } from "../../stories/fixtures/chat.js";
import { MessageAI } from "./MessageAI.js";

const meta = {
  title: "Chat/Respuesta (texto)",
  component: MessageAI,
  args: { text: RESPUESTA, streaming: false },
  decorators: [
    (Story) => (
      <div className="max-w-[732px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageAI>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completa: Story = {};

export const LlegandoConCursor: Story = {
  name: "Llegando (cursor)",
  args: { text: RESPUESTA_PARCIAL, streaming: true },
};

export const EsperandoPrimeraPalabra: Story = {
  name: "Esperando la primera palabra",
  args: { text: "", streaming: true },
};
