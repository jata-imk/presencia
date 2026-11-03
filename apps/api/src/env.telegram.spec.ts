import { afterEach, describe, expect, it, vi } from "vitest";

// Las reglas de arranque del canal Telegram (F11, ADR-030). env.ts valida al
// importarse, así que cada escenario importa de nuevo con su propio
// process.env (mismo patrón que env.assets.spec.ts).

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
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_MODE",
  "TELEGRAM_WEBHOOK_SECRET",
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

const TOKEN = "123456:abc";
const SECRET = "a".repeat(64);

describe("env: canal Telegram", () => {
  it("sin token, el canal está apagado y la API arranca igual", async () => {
    const { env } = await loadEnv({});
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_MODE).toBe("polling");
  });

  it("webhook exige el secret", async () => {
    await expect(loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_MODE: "webhook" })).rejects.toThrow(
      /TELEGRAM_WEBHOOK_SECRET/,
    );
    const { env } = await loadEnv({
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_MODE: "webhook",
      TELEGRAM_WEBHOOK_SECRET: SECRET,
    });
    expect(env.TELEGRAM_MODE).toBe("webhook");
  });

  it("un secret corto o con caracteres que Telegram no acepta no arranca", async () => {
    await expect(
      loadEnv({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_MODE: "webhook",
        TELEGRAM_WEBHOOK_SECRET: "corto",
      }),
    ).rejects.toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    await expect(
      loadEnv({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_MODE: "webhook",
        TELEGRAM_WEBHOOK_SECRET: `${"a".repeat(40)}+/=`,
      }),
    ).rejects.toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it("en producción el bot no puede ir por polling", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_MODE: "polling" }),
    ).rejects.toThrow(/TELEGRAM_MODE/);
  });
});
