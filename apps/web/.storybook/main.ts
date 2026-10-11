import type { StorybookConfig } from "@storybook/react-vite";

// Catálogo de estados de UI (F10.8.3, ADR-027). Solo local: `pnpm storybook`.
// react-vite carga el vite.config.ts de la web tal cual, así que Tailwind v4
// (@tailwindcss/vite) y los tokens llegan igual que en la app.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y"],
  // BrandMark y otros usan /assets/… de public/. Las imágenes de las cards
  // (/api/assets/<id>/content) salen de los fixtures: no hay backend.
  staticDirs: ["../public", { from: "../src/stories/fixtures/assets", to: "/api/assets" }],
  core: { disableTelemetry: true },
  // Sin el proxy de /api del vite.config de la web: con la API corriendo, una
  // imagen o un EventSource se iría al backend real. Aquí /api/* lo responden
  // el stub de fetch (mock-api.ts) y los fixtures de staticDirs.
  viteFinal: (config) => ({ ...config, server: { ...config.server, proxy: {} } }),
};

export default config;
