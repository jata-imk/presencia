import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { notice } from "../../stories/fixtures/chat.js";
import { TurnStatusCard } from "./TurnStatusCard.js";

// Los estados de un turno sin respuesta completa (F10.8.2). Varios solo se
// ven en vivo: detener en el segundo justo, perder la red, quedarse sin cuota.
const meta = {
  title: "Chat/Estado del turno",
  component: TurnStatusCard,
  args: {
    notice: notice(),
    failedAgain: false,
    apiError: null,
    onRetry: fn(),
    onEdit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[732px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TurnStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DetenidaAntesDeEmpezar: Story = {};

export const DetenidaConTexto: Story = {
  args: { notice: notice({ partial: true, hasReply: true }) },
};

export const Fallo: Story = {
  args: { notice: notice({ status: "failed" }) },
};

export const FalloOtraVez: Story = {
  name: "Falló otra vez",
  args: { notice: notice({ status: "failed" }), failedAgain: true },
};

export const RechazoConMotivo: Story = {
  name: "Rechazo con motivo (413)",
  args: {
    notice: notice({ status: "failed" }),
    apiError: "Tu mensaje es demasiado largo. El máximo es de 50,000 caracteres.",
  },
};

export const SinCuota: Story = {
  name: "Sin cuota (no ofrece Editar)",
  args: {
    notice: notice({ status: "failed" }),
    apiError: "Usaste toda tu cuota de este mes.",
    onEdit: undefined,
  },
};

export const TurnoViejoDetenido: Story = {
  args: { notice: notice({ actionable: false, hasReply: true }) },
};

export const TurnoViejoConTexto: Story = {
  args: { notice: notice({ actionable: false, hasReply: true, partial: true }) },
};

export const TurnoViejoSinRespuesta: Story = {
  args: { notice: notice({ status: "failed", actionable: false }) },
};
