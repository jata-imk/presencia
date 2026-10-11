import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageOff, TriangleAlert } from "lucide-react";
import { fn } from "storybook/test";
import { Notice } from "./PanelParts.js";

const meta = {
  title: "Panel/Aviso",
  component: Notice,
  args: {
    kind: "info",
    Icon: ImageOff,
    children: "Sin imagen: se publicará solo el texto.",
  },
  decorators: [
    (Story) => (
      <div className="max-w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const InfoConAccion: Story = {
  name: "Info con acción",
  args: { action: { label: "Generar imagen", onClick: fn() } },
};

export const ConError: Story = {
  name: "Error",
  args: {
    kind: "error",
    Icon: TriangleAlert,
    children: "Te pasas por 23 caracteres del límite de X (280). Lo que sobra está resaltado.",
  },
};

export const ErrorConAccion: Story = {
  name: "Error con acción",
  args: {
    kind: "error",
    Icon: TriangleAlert,
    children: "No pudimos generar la imagen: el generador tardó demasiado.",
    action: { label: "Reintentar", onClick: fn() },
  },
};
