import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin con la API en dev (cookies sin drama de CORS);
    // en prod Caddy hace este mismo papel.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
