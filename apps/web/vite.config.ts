import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

// La raíz del monorepo, donde vive el .env.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin con la API en dev (cookies sin drama de CORS). En prod no
    // hay proxy que haga este papel: el mismo proceso de Express sirve este
    // build y la API bajo /api (ADR-020).
    //
    // El destino sigue al PORT de la API, del shell o del .env de la raíz (el
    // mismo que lee la API): si el 3000 está ocupado, PORT=3001 mueve las dos
    // (docs/how-to/levantar-entorno.md).
    proxy: {
      "/api": `http://localhost:${loadEnv(mode, ROOT, "").PORT || "3000"}`,
    },
  },
}));
