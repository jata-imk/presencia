import { afterEach, describe, expect, it, vi } from "vitest";

// El `@esfuerzo` de las variables de modelo (F10.7, ADR-004). env.ts valida
// al importarse: cada escenario lo importa de nuevo con su propio process.env
// (mismo patrón que env.assets.spec.ts).

const BASE_ENV = {
  APP_DATABASE_URL: "postgres://test/test",
  JOBS_DATABASE_URL: "postgres://test/test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_URL: "http://localhost:5173",
  ZEPTOMAIL_TOKEN: "test-token",
  MAIL_FROM: "test@example.com",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
  OPENAI_API_KEY: "openai-key",
};

const TOUCHED = [
  ...Object.keys(BASE_ENV),
  "NODE_ENV",
  "AI_MODEL",
  "AI_MODEL_CHAT",
  "AI_MODEL_TRENDS",
  "AI_MODEL_IMAGE",
  "AI_MODEL_IMAGE_ALT",
  "IMAGE_PROVIDER",
  "AI_FALLBACK_SIMULATE",
  "ASSETS_STORAGE",
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

describe("env: esfuerzo de razonamiento en los modelos", () => {
  it("acepta un modelo de texto con @esfuerzo", async () => {
    const { env } = await loadEnv({
      AI_MODEL: "openai:gpt-6-luna@high",
      AI_MODEL_CHAT: "google:gemini-3.8-flash@medium",
      AI_MODEL_TRENDS: "google:gemini-3.8-flash@low",
    });
    expect(env.AI_MODEL_CHAT).toBe("google:gemini-3.8-flash@medium");
  });

  it("un nivel que no existe es error de arranque, con la lista de los válidos", async () => {
    await expect(loadEnv({ AI_MODEL_CHAT: "openai:gpt-6-luna@ultra" })).rejects.toThrow(
      /unknown reasoning level .{0,2}ultra.{0,2}. Use one of: none, minimal, low, medium, high, xhigh/,
    );
  });

  it("la key se sigue exigiendo con el esfuerzo puesto", async () => {
    await expect(loadEnv({ AI_MODEL_CHAT: "anthropic:claude-sonnet-5-5@high" })).rejects.toThrow(
      /AI_MODEL_CHAT usa el proveedor .{0,2}anthropic.{0,2} pero falta ANTHROPIC_API_KEY/,
    );
  });

  it("acepta una cadena de respaldo con esfuerzo por modelo", async () => {
    const { env } = await loadEnv({
      AI_MODEL_CHAT: "openai:gpt-6-luna@high, google:gemini-3.8-flash@medium",
    });
    expect(env.AI_MODEL_CHAT).toBe("openai:gpt-6-luna@high, google:gemini-3.8-flash@medium");
  });

  it("cada respaldo necesita su key: no se descubre el día que cae el principal", async () => {
    await expect(
      loadEnv({ AI_MODEL_CHAT: "openai:gpt-6-luna@high,anthropic:claude-sonnet-5-5" }),
    ).rejects.toThrow(/falta ANTHROPIC_API_KEY/);
  });

  it("el mismo modelo dos veces no es un respaldo", async () => {
    await expect(
      loadEnv({ AI_MODEL_CHAT: "openai:gpt-6-luna@high,openai:gpt-6-luna@low" }),
    ).rejects.toThrow(/repeats/);
  });

  it("las tendencias solo aceptan modelos de Google, también en los respaldos", async () => {
    await expect(
      loadEnv({ AI_MODEL_TRENDS: "google:gemini-3.8-flash,openai:gpt-6-luna" }),
    ).rejects.toThrow(/AI_MODEL_TRENDS solo acepta modelos de .{0,2}google/);
  });

  it("AI_MODEL_IMAGE acepta cadena; el generador alternativo, uno solo", async () => {
    const { env } = await loadEnv({
      IMAGE_PROVIDER: "real",
      AI_MODEL_IMAGE: "google:gemini-3.1-flash-image,openai:gpt-image-2",
    });
    expect(env.AI_MODEL_IMAGE).toBe("google:gemini-3.1-flash-image,openai:gpt-image-2");
    await expect(
      loadEnv({
        IMAGE_PROVIDER: "real",
        AI_MODEL_IMAGE_ALT: "google:gemini-3.1-flash-image,openai:gpt-image-2",
      }),
    ).rejects.toThrow(/AI_MODEL_IMAGE_ALT acepta un solo modelo/);
  });

  it("el simulador de caídas no se permite en producción ni con un proveedor inventado", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", AI_FALLBACK_SIMULATE: "openai" }),
    ).rejects.toThrow(/AI_FALLBACK_SIMULATE no se permite en producción/);
    await expect(loadEnv({ AI_FALLBACK_SIMULATE: "opneai" })).rejects.toThrow(/no es un proveedor/);
  });

  it("la lista de imagen tiene tope de 10: el pedido no acepta un generador 11", async () => {
    const once = Array.from({ length: 11 }, (_, i) => `openai:gpt-image-${String(i)}`).join(",");
    await expect(loadEnv({ IMAGE_PROVIDER: "real", AI_MODEL_IMAGE: once })).rejects.toThrow(
      /AI_MODEL_IMAGE acepta hasta 10 generadores/,
    );
  });

  it("un modelo de imagen no acepta esfuerzo", async () => {
    await expect(
      loadEnv({ IMAGE_PROVIDER: "real", AI_MODEL_IMAGE: "google:gemini-3.1-flash-image@high" }),
    ).rejects.toThrow(/AI_MODEL_IMAGE no acepta .{0,2}@high.{0,2}: un modelo de imagen no razona/);
    await expect(
      loadEnv({ IMAGE_PROVIDER: "real", AI_MODEL_IMAGE_ALT: "openai:gpt-image-2@low" }),
    ).rejects.toThrow(/AI_MODEL_IMAGE_ALT no acepta .{0,2}@low/);
  });
});
