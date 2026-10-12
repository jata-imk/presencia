import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // F10.8.4: no correr contra una base donde la API dev está corriendo su
    // cron de reconciliación (ver el archivo).
    globalSetup: ["./src/test-support/guarda-cron-dev.ts"],
  },
});
