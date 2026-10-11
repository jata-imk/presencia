import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PEDIDO, PEDIDO_LARGO } from "../../stories/fixtures/chat.js";
import { MessageUser } from "./MessageUser.js";

const meta = {
  title: "Chat/Mensaje del creator",
  component: MessageUser,
  args: {
    text: PEDIDO,
    onEdit: fn(),
    onCancelEdit: fn(),
    onSubmitEdit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[732px] py-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageUser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Un mensaje viejo: solo Copiar (en hover con mouse; al tocarlo en táctil). */
export const Normal: Story = {};

export const Largo: Story = { args: { text: PEDIDO_LARGO } };

/** El último mensaje: suma "Editar". */
export const Ultimo: Story = { name: "Último (editable)", args: { canEdit: true } };

export const EnEdicion: Story = {
  name: "En edición",
  args: { canEdit: true, editing: true },
};

export const EdicionPasadaDelTope: Story = {
  name: "En edición, pasada del tope",
  args: { canEdit: true, editing: true, text: "a".repeat(MAX_MESSAGE_CHARS + 25) },
};
