import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { PEDIDO } from "../../stories/fixtures/chat.js";
import { Composer } from "./Composer.js";

const meta = {
  title: "Chat/Composer",
  component: Composer,
  args: {
    value: "",
    onChange: fn(),
    onSubmit: fn(),
    onStop: fn(),
    busy: false,
  },
  // Con estado propio: escribir en la historia sí cambia el texto.
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <div className="max-w-[752px] pt-12">
        <Composer
          {...args}
          value={value}
          onChange={(next) => {
            setValue(next);
            args.onChange(next);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vacio: Story = { name: "Vacío" };

export const ConTexto: Story = { args: { value: PEDIDO } };

export const CercaDelTope: Story = {
  name: "Cerca del tope (contador)",
  args: { value: "a".repeat(Math.floor(MAX_MESSAGE_CHARS * 0.95)) },
};

export const PasadoDelTope: Story = {
  name: "Pasado del tope",
  args: { value: "a".repeat(MAX_MESSAGE_CHARS + 1) },
};

export const Ocupado: Story = {
  name: "Ocupado (Detener generación)",
  args: { busy: true },
};

export const Grande: Story = {
  name: "Grande (nuevo chat)",
  args: { large: true, placeholder: "¿Qué quieres publicar hoy?" },
};
