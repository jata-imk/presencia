import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import {
  clasificar,
  observacionesDeSondas,
  PREFIJO_PRUEBA,
  PREFIJO_PRUEBA_IMAGEN,
  restanteDelMes,
  silencioWav,
  sondasDelEntorno,
  type ResultadoSonda,
} from "./provider-probe.js";

// F12.8 PR4 (ADR-031): la prueba activa diaria. Lo que se prueba aquí es qué
// sondas arma, cómo lee los errores y qué prende; las llamadas reales se
// verificaron a mano con `sonda:proveedores` (ver el addendum del ADR).

function errorDeApi(statusCode: number, responseBody: string) {
  return new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

const ENV = {
  GOOGLE_GENERATIVE_AI_API_KEY: "g",
  OPENAI_API_KEY: "o",
  ANTHROPIC_API_KEY: "a",
  GROQ_API_KEY: "q",
  AI_MODEL_CHAT:
    "openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5",
  AI_MODEL_UTILITY: "openai:gpt-6-luna@low,google:gemini-3.8-flash@low",
  AI_MODEL_IMAGE: "openai:gpt-image-2,google:gemini-3.1-flash-image",
};

describe("sondasDelEntorno", () => {
  it("cada modelo una vez aunque esté en varias cadenas; sin bot ni Brave, sin esas sondas", () => {
    const sondas = sondasDelEntorno(ENV, { imagenes: false });
    expect(sondas.map((s) => s.key)).toEqual([
      "probe:openai:gpt-6-luna",
      "probe:google:gemini-3.8-flash",
      "probe:anthropic:claude-sonnet-5-5",
      // AI_MODEL_ADAPT sin setear cae a AI_MODEL (aquí, su default); tendencias, el suyo.
      "probe:google:gemini-3.6-flash",
      "probe:google:gemini-embedding-001",
    ]);
  });

  it("con bot, Brave e imágenes, las suma; las imágenes en su propio prefijo", () => {
    const sondas = sondasDelEntorno(
      {
        ...ENV,
        TELEGRAM_BOT_TOKEN: "t",
        WEB_SEARCH_PROVIDER: "brave",
        BRAVE_SEARCH_API_KEY: "b",
        IMAGE_PROVIDER: "real",
      },
      { imagenes: true },
    );
    expect(sondas.map((s) => s.key).slice(5)).toEqual([
      "probe:groq:whisper-large-v3-turbo",
      "probe:openai:gpt-4o-mini-transcribe",
      "probe:brave",
      "probe-imagen:openai:gpt-image-2",
      "probe-imagen:google:gemini-3.1-flash-image",
    ]);
  });

  it("con el generador de mentira no prueba imágenes", () => {
    const sondas = sondasDelEntorno({ ...ENV, IMAGE_PROVIDER: "fake" }, { imagenes: true });
    expect(sondas.some((s) => s.tipo === "imagen")).toBe(false);
  });
});

describe("clasificar", () => {
  it("lee saldo, key, modelo retirado y límite de tasa", () => {
    expect(clasificar(errorDeApi(402, "")).motivo).toBe("sin saldo");
    expect(clasificar(errorDeApi(400, "Your credit balance is too low")).motivo).toBe("sin saldo");
    expect(clasificar(errorDeApi(401, "invalid x-api-key")).motivo).toBe("la key no sirve");
    expect(clasificar(errorDeApi(404, "model: claude-inexistente")).motivo).toBe(
      "el modelo no existe (¿lo retiraron?)",
    );
    expect(clasificar(errorDeApi(429, "Quota exceeded per minute")).motivo).toBe("límite de tasa");
    expect(clasificar(new Error("socket hang up")).motivo).toBe("no contestó");
  });
});

describe("observacionesDeSondas", () => {
  const ok = (key: string): ResultadoSonda => ({
    key,
    id: key,
    tipo: "texto",
    ms: 1,
    medicion: {},
  });
  const resultados: ResultadoSonda[] = [
    ok("probe:openai:gpt-6-luna"),
    { ...ok("probe:anthropic:claude-sonnet-5-5"), medicion: undefined, error: errorDeApi(402, "") },
    { ...ok("probe:brave"), medicion: { aviso: "Quedan 12 consultas" } },
    {
      ...ok("probe-imagen:google:x"),
      tipo: "imagen",
      medicion: undefined,
      error: errorDeApi(404, ""),
    },
  ];

  it("prende lo que falló y lo que avisa, solo de su prefijo", () => {
    expect(observacionesDeSondas(resultados, PREFIJO_PRUEBA).map((o) => o.title)).toEqual([
      "Prueba diaria: probe:anthropic:claude-sonnet-5-5 · sin saldo",
      "Prueba diaria: probe:brave",
    ]);
    expect(observacionesDeSondas(resultados, PREFIJO_PRUEBA_IMAGEN).map((o) => o.key)).toEqual([
      "probe-imagen:google:x",
    ]);
  });
});

describe("restanteDelMes", () => {
  it("lee la ventana más larga, y un tope de 0 es sin tope", () => {
    expect(restanteDelMes("1, 2000", "1, 1998")).toBe(1998);
    expect(restanteDelMes("50, 0", "49, 0")).toBeNull();
    expect(restanteDelMes(null, "49")).toBeNull();
  });
});

describe("silencioWav", () => {
  it("es un WAV válido de 16 kHz mono del largo pedido", () => {
    const wav = Buffer.from(silencioWav(1));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.length).toBe(44 + 32_000);
  });
});
