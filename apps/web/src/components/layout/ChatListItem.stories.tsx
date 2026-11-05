import type { ChatSummary, TelegramLinkStatusDto } from "@presencia/shared";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { userEvent, within } from "storybook/test";
import { useChatsStore } from "../../stores/chats-store.js";
import { useTelegramLinkStore } from "../../stores/telegram-link-store.js";
import { ChatListItem } from "./ChatListItem.js";

// Una fila de Recientes con los íconos de canal (F11 PR7b, Claude Design
// "Chat Telegram" §2.1-2.2): solo web (nada), por Telegram, seleccionada,
// título largo, y el menú ··· con "Continuar en Telegram" conectado y sin
// conectar. El menú vive en un portal: revísalo con el tema "Oscuro", no
// "Lado a lado".

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "chat-demo",
  title: "Precios del café en Mérida",
  folderId: null,
  archivedAt: null,
  pinnedAt: null,
  lastMessageAt: "2026-11-04T18:00:00.000Z",
  createdAt: "2026-11-04T17:00:00.000Z",
  channels: ["telegram"],
  ...over,
});

const status = (state: TelegramLinkStatusDto["state"]): TelegramLinkStatusDto => ({
  state,
  username: state === "connected" ? "josetejero" : null,
  linkedAt: state === "connected" ? "2026-10-28T15:00:00.000Z" : null,
  expiresAt: null,
  botUsername: "presencia_dev_bot",
});

/**
 * Los stores que lee la fila: el chat (el menú lo busca ahí para ofrecer
 * Fijar y Continuar) y el vínculo con Telegram. `parameters.telegram` elige
 * el estado.
 */
const conStores: Decorator = (Story, { args, parameters }) => {
  useChatsStore.setState({ chats: [(args as { chat: ChatSummary }).chat] });
  useTelegramLinkStore.setState({
    status: status((parameters.telegram ?? "connected") as TelegramLinkStatusDto["state"]),
  });
  return (
    <MemoryRouter>
      <div className="w-66 bg-card p-2">
        <Story />
      </div>
    </MemoryRouter>
  );
};

const meta = {
  title: "Layout/Fila de Recientes",
  component: ChatListItem,
  args: { chat: chat(), active: false },
  decorators: [conStores],
} satisfies Meta<typeof ChatListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** La web es el canal por defecto: un chat solo de la web no lleva ícono. */
export const SoloWeb: Story = { name: "Solo web", args: { chat: chat({ channels: [] }) } };

export const PorTelegram: Story = { name: "Usado desde Telegram" };

export const Seleccionado: Story = {
  name: "Seleccionado, con Telegram",
  args: { active: true },
};

/** Se trunca el título, nunca el ícono. */
export const TituloLargo: Story = {
  name: "Título largo, con Telegram",
  args: { chat: chat({ title: "Guion del podcast con Ana sobre marca personal y ventas" }) },
};

const abrirMenu: Story["play"] = async ({ canvasElement }) => {
  for (const trigger of within(canvasElement).getAllByRole("button", { name: "Más opciones" })) {
    await userEvent.click(trigger);
  }
};

export const MenuConectado: Story = {
  name: "Menú · Telegram conectado",
  play: abrirMenu,
};

export const MenuSinConectar: Story = {
  name: "Menú · sin conectar",
  parameters: { telegram: "disconnected" },
  play: abrirMenu,
};
