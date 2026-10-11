import type { StorybookConfig } from "@storybook/react-vite";

// Catálogo de estados de UI (F10.8.3, ADR-027). Solo local: `pnpm storybook`.
// react-vite carga el vite.config.ts de la web tal cual, así que Tailwind v4
// (@tailwindcss/vite) y los tokens llegan igual que en la app.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  // BrandMark y otros usan /assets/… de public/.
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};

export default config;
