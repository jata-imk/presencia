import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { showToast, type ToastOptions } from "../../stores/toast-store.js";
import { ToastViewport } from "./Toast.js";

// Los toasts (F6 PR4), con el enlace de F11 PR7b ("Abrir Telegram" tras
// "Continuar en Telegram"). Viven fijos abajo al centro: revísalos con el
// tema "Oscuro", no "Lado a lado".

function Demo(options: ToastOptions) {
  useEffect(() => {
    showToast({ ...options, durationMs: 600_000 });
  }, [options]);
  return <ToastViewport />;
}

const meta = {
  title: "UI/Toast",
  component: Demo,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-40">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConEnlace: Story = {
  name: "Con enlace (Continuar en Telegram)",
  args: {
    tone: "success",
    title: "Listo: este chat ya está en Telegram",
    description: "Lo encuentras como tema en el bot.",
    link: { label: "Abrir Telegram", href: "https://t.me/presencia_dev_bot" },
  },
};

export const ConError: Story = {
  name: "Error",
  args: {
    title: "No se pudo abrir en Telegram",
    description: "No pude escribirte en Telegram. Abre el bot, toca Iniciar y vuelve a intentarlo.",
  },
};
