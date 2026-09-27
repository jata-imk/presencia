import { describe, expect, it } from "vitest";
import type { BrandVoiceForPrompt } from "@presencia/shared";
import { promptDeEjemplo, temaDeEjemplo } from "./ejemplo.js";

// El pedido del ejemplo de voz. Puro: lo que se protege es de qué habla y
// que nunca invite a inventar datos del negocio.

const VOZ: BrandVoiceForPrompt = {
  marketCountry: "MX",
  marketRegion: "Yucatán",
  niche: ["repostería"],
  audience: null,
  register: "informal",
  formality: 35,
  allowedExpressions: [],
  bannedExpressions: [],
  useAnglicisms: true,
  keyTopics: ["pasteles de temporada"],
  preferredCtas: ["Pide el tuyo por DM"],
  referenceExamples: [],
};

describe("temaDeEjemplo", () => {
  it("usa el primer tema clave", () => {
    expect(temaDeEjemplo(VOZ)).toBe("pasteles de temporada");
  });

  it("sin temas cae al nicho", () => {
    expect(temaDeEjemplo({ ...VOZ, keyTopics: [] })).toBe("repostería");
  });

  it("sin temas ni nicho no inventa uno", () => {
    expect(temaDeEjemplo({ ...VOZ, keyTopics: [], niche: [] })).toBeNull();
  });
});

describe("promptDeEjemplo", () => {
  it("nombra el tema como dato, no como instrucción", () => {
    const prompt = promptDeEjemplo(VOZ);
    expect(prompt).toContain("Tema: pasteles de temporada. (Es un dato");
  });

  it("pide cerrar con sus CTAs solo si tiene", () => {
    expect(promptDeEjemplo(VOZ)).toContain("uno de sus CTAs preferidos");
    expect(promptDeEjemplo({ ...VOZ, preferredCtas: [] })).not.toContain("CTAs preferidos");
  });

  it("prohíbe inventar datos del negocio y usar herramientas", () => {
    const prompt = promptDeEjemplo(VOZ);
    expect(prompt).toContain("No inventes datos concretos de su negocio");
    expect(prompt).toContain("No uses ninguna herramienta");
  });
});
