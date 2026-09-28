import { afterEach, describe, expect, it, vi } from "vitest";

// Las reglas de arranque del storage de assets (F10, ADR-011). env.ts valida
// al importarse, así que cada escenario importa de nuevo con su propio
// process.env (mismo patrón que ai.service.spec.ts).

const BASE_ENV = {
  APP_DATABASE_URL: "postgres://test/test",
  JOBS_DATABASE_URL: "postgres://test/test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_URL: "http://localhost:5173",
  ZEPTOMAIL_TOKEN: "test-token",
  MAIL_FROM: "test@example.com",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
};

const TOUCHED = [
  ...Object.keys(BASE_ENV),
  "NODE_ENV",
  "ASSETS_STORAGE",
  "ASSETS_S3_BUCKET",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "BACKUP_DATABASE_URL",
];
const ORIGINAL = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));

async function loadEnv(extra: Record<string, string>) {
  vi.resetModules();
  for (const key of TOUCHED) delete process.env[key];
  Object.assign(process.env, BASE_ENV, extra);
  return import("./env.js");
}

afterEach(() => {
  for (const key of TOUCHED) {
    if (ORIGINAL[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL[key];
  }
});

const R2 = {
  S3_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("env: storage de assets", () => {
  it("en dev el default es disco local", async () => {
    const { env } = await loadEnv({ NODE_ENV: "development" });
    expect(env.ASSETS_STORAGE).toBe("local");
  });

  it("en producción el disco local es un error de arranque", async () => {
    await expect(loadEnv({ NODE_ENV: "production" })).rejects.toThrow(
      /En producción los assets van al bucket/,
    );
  });

  it("r2 exige el bucket de assets", async () => {
    await expect(loadEnv({ ASSETS_STORAGE: "r2", ...R2 })).rejects.toThrow(/ASSETS_S3_BUCKET/);
  });

  it("r2 con credenciales pero sin backup no pide lo del backup", async () => {
    const { env } = await loadEnv({
      NODE_ENV: "production",
      ASSETS_STORAGE: "r2",
      ASSETS_S3_BUCKET: "presencia-assets",
      ...R2,
    });
    expect(env.ASSETS_S3_BUCKET).toBe("presencia-assets");
  });

  it("el backup a medias sigue siendo error", async () => {
    await expect(loadEnv({ ...R2, S3_BUCKET: "presencia-backups" })).rejects.toThrow(
      /BACKUP_DATABASE_URL/,
    );
  });
});
