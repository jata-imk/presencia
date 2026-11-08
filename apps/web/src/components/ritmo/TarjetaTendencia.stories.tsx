import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { TrendItem } from "@presencia/shared";
import { TarjetaTendencia } from "./RitmoSections.js";

// La tarjeta de "Tendencias en tu nicho" (Ritmo). F12.5 le suma "Explorar en
// Chat": lleva el tema al composer de un chat nuevo, sin mandarlo.

const tendencia: TrendItem = {
  topic: "Rutinas de productividad sin apps de pago",
  signal: "rising",
  network: "tiktok",
  format: "reel",
  blurb:
    "Creators de oficina muestran cómo organizan la semana con libreta y calendario del teléfono, sin suscripciones.",
  sourceTitle: "xataka.com.mx",
  sourceUrl: "https://www.xataka.com.mx/nota",
};

const meta = {
  title: "Ritmo/Tarjeta de tendencia",
  component: TarjetaTendencia,
  args: { item: tendencia, onExplorar: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-[360px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TarjetaTendencia>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConExplorar: Story = { name: "Con «Explorar en Chat»" };

/** La fuente larga se corta: el botón no se sale de la tarjeta a 375px. */
export const FuenteLarga: Story = {
  args: {
    item: {
      ...tendencia,
      signal: "new",
      sourceTitle: "El Financiero — Tendencias de consumo en el sureste de México",
    },
  },
};

export const SinAccion: Story = {
  name: "Sin acción (antes de F12.5)",
  args: { onExplorar: undefined },
};
