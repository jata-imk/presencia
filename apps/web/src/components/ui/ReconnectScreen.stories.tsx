import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReconnectScreen } from "./ReconnectScreen.js";

// Al abrir o recargar la app con la API caída (F10.8.4): en vivo solo se ve
// durante un deploy, o apagando la API dev y recargando.

const meta = {
  title: "App/Sin conexión con la API",
  component: ReconnectScreen,
  args: { reintentando: false, onReintentar: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ReconnectScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Entre un intento y otro: el botón deja reintentar ya. */
export const Esperando: Story = {};

/** Con un intento en curso. */
export const Conectando: Story = { args: { reintentando: true } };
