import type { TelegramLinkStatusDto } from "@presencia/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { CanalesPage } from "./canales.js";

// Configuración → Canales conectados (F11 PR7a): el orden de las secciones,
// "Chatear desde" (Telegram) arriba de "Redes para publicar" (PostFast), con
// la API de ejemplo. Los estados de la tarjeta de Telegram, uno por uno,
// viven en "Configuración/Telegram".

const status = (over: Partial<TelegramLinkStatusDto>): TelegramLinkStatusDto => ({
  state: "disconnected",
  username: null,
  linkedAt: null,
  expiresAt: null,
  botUsername: "presencia_dev_bot",
  ...over,
});

const CUENTAS = [
  {
    id: "cuenta-ig",
    network: "instagram",
    displayName: "@josetejero",
    status: "active",
  },
  {
    id: "cuenta-li",
    network: "linkedin",
    displayName: "José Alejandro Tejero",
    status: "active",
  },
];

const meta = {
  title: "Configuración/Canales conectados",
  component: CanalesPage,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/configuracion/canales"]}>
        <div className="max-w-(--content-max-w)">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof CanalesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const api = (telegram: TelegramLinkStatusDto) => ({
  "/api/channels": { body: CUENTAS },
  "/api/telegram/link": { body: telegram },
});

export const TelegramConectado: Story = {
  name: "Telegram conectado",
  parameters: {
    api: api(
      status({ state: "connected", username: "josetejero", linkedAt: "2026-10-28T15:00:00.000Z" }),
    ),
  },
};

export const TelegramSinConectar: Story = {
  name: "Telegram sin conectar",
  parameters: { api: api(status({})) },
};

/** Sin bot en el servidor: solo las redes. */
export const SinBot: Story = {
  name: "Sin bot en el servidor",
  parameters: { api: api(status({ state: "unavailable", botUsername: null })) },
};
