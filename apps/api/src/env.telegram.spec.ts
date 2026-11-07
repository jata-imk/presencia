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
  // F11 PR6: con el bot prendido, la cadena de transcripción por default
  // (Groq y OpenAI de respaldo) necesita sus keys.
  GROQ_API_KEY: "groq-key",
  OPENAI_API_KEY: "openai-key",
};

const TOUCHED = [
  ...Object.keys(BASE_ENV),
  "NODE_ENV",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_MODE",
  "TELEGRAM_WEBHOOK_SECRET",
  "AI_MODEL_TRANSCRIBE",
  "OPS_TELEGRAM_CHAT_ID",
  "OPS_ALERT_EMAIL",
];
const ORIGINAL = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));

async function loadEnv(extra: Record<string, string>) {
  vi.resetModules();
  for (const key of TOUCHED) delete process.env[key];
  Object.assign(process.env, BASE_ENV, extra);
  // "" = sin la variable (p. ej. quitar una key de BASE_ENV).
  for (const [key, value] of Object.entries(extra)) if (value === "") delete process.env[key];
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

  // F11 PR6: la cadena que transcribe las notas de voz.
  it("sin bot, la transcripción no exige la key de Groq", async () => {
    const { env } = await loadEnv({ GROQ_API_KEY: "" });
    expect(env.AI_MODEL_TRANSCRIBE).toBeUndefined();
  });

  it("con bot, la cadena por default exige la key de Groq", async () => {
    await expect(loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN, GROQ_API_KEY: "" })).rejects.toThrow(
      /AI_MODEL_TRANSCRIBE usa el proveedor .*groq.* pero falta GROQ_API_KEY/,
    );
    const { env } = await loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN });
    expect(env.TELEGRAM_BOT_TOKEN).toBe(TOKEN);
  });

  it("la cadena no acepta @esfuerzo ni proveedores sin transcripción", async () => {
    await expect(
      loadEnv({
        TELEGRAM_BOT_TOKEN: TOKEN,
        AI_MODEL_TRANSCRIBE: "openai:gpt-4o-mini-transcribe@high",
      }),
    ).rejects.toThrow(/no razona/);
    await expect(
      loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN, AI_MODEL_TRANSCRIBE: "google:gemini-3.6-flash" }),
    ).rejects.toThrow(/solo acepta modelos de groq u openai/);
    const { env } = await loadEnv({
      TELEGRAM_BOT_TOKEN: TOKEN,
      AI_MODEL_TRANSCRIBE: "openai:gpt-4o-mini-transcribe",
      GROQ_API_KEY: "",
    });
    expect(env.AI_MODEL_TRANSCRIBE).toBe("openai:gpt-4o-mini-transcribe");
  });
});

// F12.8 (ADR-031): a quién avisa el worker cuando algo que corre solo falla.
describe("env: canal de las alertas de operación", () => {
  it("el chat_id sin bot es un error de arranque", async () => {
    await expect(loadEnv({ OPS_TELEGRAM_CHAT_ID: "12345" })).rejects.toThrow(
      /OPS_TELEGRAM_CHAT_ID requiere TELEGRAM_BOT_TOKEN/,
    );
  });

  it("acepta el chat_id negativo de un grupo", async () => {
    const { env } = await loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN, OPS_TELEGRAM_CHAT_ID: "-100123" });
    expect(env.OPS_TELEGRAM_CHAT_ID).toBe(-100123);
  });

  it("un chat_id vacío cuenta como sin canal, no como el chat 0", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", TELEGRAM_BOT_TOKEN: TOKEN, OPS_TELEGRAM_CHAT_ID: " " }),
    ).rejects.toThrow(/las alertas de operación necesitan un canal/);
    const { env } = await loadEnv({ TELEGRAM_BOT_TOKEN: TOKEN, OPS_TELEGRAM_CHAT_ID: "" });
    expect(env.OPS_TELEGRAM_CHAT_ID).toBeUndefined();
  });

  it("en dev no hace falta canal", async () => {
    const { env } = await loadEnv({});
    expect(env.OPS_TELEGRAM_CHAT_ID).toBeUndefined();
    expect(env.OPS_ALERT_EMAIL).toBeUndefined();
  });

  it("en producción sin ningún canal no arranca", async () => {
    await expect(loadEnv({ NODE_ENV: "production" })).rejects.toThrow(
      /las alertas de operación necesitan un canal/,
    );
    await expect(
      loadEnv({ NODE_ENV: "production", OPS_ALERT_EMAIL: "ops@example.com" }),
    ).rejects.not.toThrow(/las alertas de operación necesitan un canal/);
  });
});
