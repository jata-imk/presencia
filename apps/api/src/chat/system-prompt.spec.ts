import { describe, expect, it } from "vitest";
import type { BrandVoiceForPrompt } from "@presencia/shared";
import { BASE_SYSTEM_PROMPT, buildSystemPrompt } from "./system-prompt.js";

// system-prompt.ts no depende de Nest/DB (comentario en el archivo) — a
// diferencia de brand-voice.service.spec.ts, este test importa directo sin
// el patrón de beforeAll + import dinámico.

function makeVoice(overrides: Partial<BrandVoiceForPrompt> = {}): BrandVoiceForPrompt {
  return {
    marketCountry: "MX",
    marketRegion: "Yucatán",
    niche: ["taquería"],
    audience: "vecinos del barrio",
    register: "de_barrio",
    formality: 15,
    allowedExpressions: ["chido"],
    bannedExpressions: ["premium"],
    useAnglicisms: false,
    keyTopics: ["promos del día"],
    preferredCtas: ["Cae por acá"],
    referenceExamples: [{ text: "Ejemplo de post anterior." }],
    ...overrides,
  };
}

describe("buildSystemPrompt — sin voz", () => {
  it("devuelve exactamente BASE_SYSTEM_PROMPT sin argumento", () => {
    expect(buildSystemPrompt()).toBe(BASE_SYSTEM_PROMPT);
  });

  it("devuelve exactamente BASE_SYSTEM_PROMPT con null (a medio onboarding)", () => {
    expect(buildSystemPrompt(null)).toBe(BASE_SYSTEM_PROMPT);
  });

  it("no incluye el delimitador <voz_de_marca> cuando no hay voz", () => {
    expect(buildSystemPrompt(null)).not.toContain("<voz_de_marca>");
  });
});

describe("buildSystemPrompt — con voz completa", () => {
  const prompt = buildSystemPrompt(makeVoice());

  it("incluye el prompt base intacto", () => {
    expect(prompt).toContain(BASE_SYSTEM_PROMPT);
  });

  it("delimita el bloque de voz de marca", () => {
    expect(prompt).toContain("<voz_de_marca>");
    expect(prompt).toContain("</voz_de_marca>");
  });

  it("avisa que el bloque son datos del usuario, no instrucciones", () => {
    expect(prompt).toMatch(/no instrucciones/i);
  });

  it("incluye mercado, nicho y audiencia", () => {
    expect(prompt).toContain("Mercado: MX / Yucatán.");
    expect(prompt).toContain("Nicho: taquería.");
    expect(prompt).toContain("Audiencia: vecinos del barrio.");
  });

  it("incluye modismos permitidos y prohibidos por separado", () => {
    expect(prompt).toMatch(/permitidos.*chido/i);
    expect(prompt).toMatch(/PROHIBIDOS.*premium/);
  });

  it("incluye temas clave y CTAs preferidos", () => {
    expect(prompt).toContain("Temas clave: promos del día.");
    expect(prompt).toContain("CTAs preferidos: Cae por acá.");
  });

  it("respeta useAnglicisms: false", () => {
    expect(prompt).toContain("Evita anglicismos.");
    expect(prompt).not.toContain("Los anglicismos están permitidos.");
  });

  it("incluye el ejemplo de referencia delimitado", () => {
    expect(prompt).toContain("<ejemplo_de_referencia>");
    expect(prompt).toContain("Ejemplo de post anterior.");
    expect(prompt).toContain("</ejemplo_de_referencia>");
  });
});

describe("buildSystemPrompt — campos vacíos se omiten (doc §6, voz solo-onboarding)", () => {
  const prompt = buildSystemPrompt(
    makeVoice({
      marketRegion: null,
      audience: null,
      allowedExpressions: [],
      bannedExpressions: [],
      keyTopics: [],
      preferredCtas: [],
      referenceExamples: [],
    }),
  );

  it("mercado cae solo al país cuando no hay región", () => {
    expect(prompt).toContain("Mercado: MX.");
  });

  it("no menciona audiencia, modismos, temas ni CTAs si están vacíos", () => {
    expect(prompt).not.toContain("Audiencia:");
    expect(prompt).not.toMatch(/permitidos/i);
    expect(prompt).not.toContain("PROHIBIDOS");
    expect(prompt).not.toContain("Temas clave:");
    expect(prompt).not.toContain("CTAs preferidos:");
  });

  it("no incluye bloques de ejemplo sin referenceExamples", () => {
    expect(prompt).not.toContain("<ejemplo_de_referencia>");
  });

  it("aun así incluye el registro (formality siempre tiene un valor)", () => {
    expect(prompt).toMatch(/Registro: /);
  });
});

describe("buildSystemPrompt — zonas de formalidad", () => {
  const cases: Array<[number, string]> = [
    [0, "de barrio"],
    [24, "de barrio"],
    [25, "casual"],
    [44, "casual"],
    [45, "neutro-profesional"],
    [64, "neutro-profesional"],
    [65, "profesional"],
    [84, "profesional"],
    [85, "técnico/formal"],
    [100, "técnico/formal"],
  ];

  it.each(cases)("formality %i mapea a la zona '%s'", (formality, label) => {
    const prompt = buildSystemPrompt(makeVoice({ formality }));
    expect(prompt).toContain(`Registro: ${label}.`);
  });
});

describe("buildSystemPrompt — tope defensivo de ejemplos de referencia", () => {
  it("nunca incluye más de 2 ejemplos aunque el objeto traiga más", () => {
    const prompt = buildSystemPrompt(
      makeVoice({
        referenceExamples: [{ text: "uno" }, { text: "dos" }, { text: "tres" }],
      }),
    );
    const occurrences = prompt.split("<ejemplo_de_referencia>").length - 1;
    expect(occurrences).toBe(2);
    expect(prompt).not.toContain("tres");
  });
});
