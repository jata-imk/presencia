import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ModalDisconnectTelegram } from "./ModalDisconnectTelegram.js";
import { TelegramCard } from "./TelegramCard.js";

// Telegram en Configuración → Canales conectados (F11 PR7a, Claude Design
// "Chat Telegram" §1), en cada estado. La tarjeta solo pinta: el estado llega
// por `view`, así no hace falta bot ni API. La cuenta regresiva no corre aquí
// (la mueve el hook de la página).

const URL_DEMO =
  "https://t.me/presencia_dev_bot?start=Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5";

const meta = {
  title: "Configuración/Telegram",
  component: TelegramCard,
  args: {
    view: { kind: "off" },
    onConnect: fn(),
    onDisconnect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-180">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TelegramCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desconectado: Story = {};

export const Esperando: Story = {
  name: "Esperando (con QR)",
  args: { view: { kind: "wait", url: URL_DEMO, remainingMs: 872_000 } },
};

/** Recargó con el enlace pendiente: la web ya no lo tiene y ofrece otro. */
export const EsperandoSinEnlace: Story = {
  name: "Esperando · recargaste",
  args: { view: { kind: "wait", url: null, remainingMs: 600_000 } },
};

/** En el cel el QR va escondido: Telegram suele estar en ese mismo cel. */
export const EsperandoMovil: Story = {
  name: "Esperando · móvil",
  args: { view: { kind: "wait", url: URL_DEMO, remainingMs: 872_000 } },
  globals: { viewport: { value: "movil" } },
};

export const Vencido: Story = {
  args: { view: { kind: "exp", url: URL_DEMO } },
};

export const VencidoSinEnlace: Story = {
  name: "Vencido · sin enlace",
  args: { view: { kind: "exp", url: null } },
};

/** Ese Telegram ya está conectado a otro perfil de Presencia. */
export const NoSeConecto: Story = {
  name: "No se conectó",
  args: { view: { kind: "err" } },
};

export const Conectado: Story = {
  args: {
    view: {
      kind: "on",
      username: "josetejero",
      linkedAt: "2026-10-28T15:00:00.000Z",
      botUsername: "presencia_dev_bot",
    },
  },
};

/** Una cuenta de Telegram sin @usuario, y el bot todavía arrancando. */
export const ConectadoSinUsuario: Story = {
  name: "Conectado · sin @usuario",
  args: {
    view: { kind: "on", username: null, linkedAt: "2026-10-28T15:00:00.000Z", botUsername: null },
  },
};

export const ConectadoMovil: Story = {
  name: "Conectado · móvil",
  args: Conectado.args,
  globals: { viewport: { value: "movil" } },
};

/** El servidor no pudo generar el enlace (el bot no terminó de arrancar). */
export const ErrorAlGenerar: Story = {
  name: "Error al generar",
  args: { error: "Telegram no está disponible ahora. Inténtalo en un rato." },
};

/** La confirmación vive en un portal: revísala con el tema "Oscuro", no "Lado a lado". */
export const ConfirmarDesconectar: Story = {
  name: "Desconectar · confirmación",
  args: Conectado.args,
  render: (args) => (
    <>
      <TelegramCard {...args} />
      <ModalDisconnectTelegram
        username="josetejero"
        onClose={fn()}
        onConfirm={() => new Promise(() => {})}
        onDisconnected={fn()}
      />
    </>
  ),
};
