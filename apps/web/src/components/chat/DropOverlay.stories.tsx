import type { Meta, StoryObj } from "@storybook/react-vite";
import { DropOverlay } from "./DropOverlay.js";

// El overlay al arrastrar archivos sobre la columna del chat (F10.9). En la
// app solo se ve mientras se arrastra: aquí, fijo sobre una columna de ejemplo.
const meta = {
  title: "Chat/Soltar archivos",
  component: DropOverlay,
  args: { verdict: "accept", count: 3 },
  decorators: [
    (Story) => (
      <div className="relative h-[520px] rounded-lg bg-app">
        <div className="p-6 text-sm text-fg-secondary">
          La conversación queda detrás del overlay.
        </div>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Acepta: Story = { name: "Suelta para adjuntar" };

export const TipoNoAceptado: Story = {
  name: "Rechazo · tipo no aceptado",
  args: { verdict: "type", count: 1 },
};

export const Limite: Story = {
  name: "Rechazo · ya hay 10",
  args: { verdict: "limit", count: 2 },
};
