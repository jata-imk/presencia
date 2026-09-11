import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin con la API en dev (cookies sin drama de CORS). En prod no
    // hay proxy que haga este papel: el mismo proceso de Express sirve este
    // build y la API bajo /api (ADR-020).
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
