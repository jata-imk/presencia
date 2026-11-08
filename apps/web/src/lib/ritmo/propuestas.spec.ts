import { describe, expect, it } from "vitest";
import type { TrendItem } from "@presencia/shared";
import {
  elegirPropuestas,
  promptDePropuesta,
  promptDeTendencia,
  type ConPropuesta,
} from "./propuestas.js";

function item(topic: string, format: TrendItem["format"], conPropuesta = true): TrendItem {
  return {
    topic,
    signal: "rising",
    network: "tiktok",
    format,
    blurb: "Se está moviendo.",
    sourceTitle: "xataka.com.mx",
    sourceUrl: "https://xataka.com.mx/nota",
    ...(conPropuesta ? { propuesta: { titulo: `Título de ${topic}`, gancho: "Gancho" } } : {}),
  };
}

describe("elegirPropuestas", () => {
  it("ignora las tendencias sin propuesta", () => {
    expect(
      elegirPropuestas([item("a", "reel", false), item("b", "post")]).map((p) => p.topic),
    ).toEqual(["b"]);
  });

  it("prefiere formatos distintos y respeta el orden de la tanda", () => {
    const elegidas = elegirPropuestas([
      item("reel 1", "reel"),
      item("reel 2", "reel"),
      item("carrusel", "carrusel"),
      item("post", "post"),
    ]);
    expect(elegidas.map((p) => p.topic)).toEqual(["reel 1", "carrusel", "post"]);
  });

  it("completa con repetidos si no hay tres formatos", () => {
    const elegidas = elegirPropuestas([
      item("r1", "reel"),
      item("r2", "reel"),
      item("r3", "reel"),
      item("r4", "reel"),
    ]);
    expect(elegidas.map((p) => p.topic)).toEqual(["r1", "r2", "r3"]);
  });

  it("sin propuestas devuelve vacío", () => {
    expect(elegirPropuestas([])).toEqual([]);
  });
});

describe("promptDeTendencia", () => {
  it("lleva el tema, el resumen, la fuente con su URL y pregunta en vez de pedir que la cree", () => {
    const prompt = promptDeTendencia({
      ...item("Rutinas sin apps de pago", "reel", false),
      blurb: "Organizan la semana con libreta.",
    });
    expect(prompt).toContain("tendencia de mi nicho: Rutinas sin apps de pago.");
    expect(prompt).toContain("Organizan la semana con libreta.");
    expect(prompt).toContain("Fuente: xataka.com.mx (https://xataka.com.mx/nota)");
    expect(prompt).toContain("Aparece en TikTok como un reel");
    expect(prompt).toContain("¿Qué publicación me recomiendas");
    expect(prompt).not.toContain("Quiero crear");
  });

  // La tarjeta puede decir "Estable" o "Nuevo": el texto no promete impulso.
  it("no afirma que la tendencia está subiendo", () => {
    const estable = {
      ...item("x", "post", false),
      signal: "stable" as const,
      blurb: "Sigue igual.",
    };
    expect(promptDeTendencia(estable)).not.toMatch(/moviendo|subiendo/i);
  });
});

describe("promptDePropuesta", () => {
  it("lleva formato, red, título, gancho y la tendencia con su fuente", () => {
    const prompt = promptDePropuesta(
      item("Carruseles antes y después", "carrusel") as ConPropuesta,
    );
    expect(prompt).toContain("Quiero crear un carrusel para TikTok");
    expect(prompt).toContain("Título: Título de Carruseles antes y después");
    expect(prompt).toContain("Gancho: Gancho");
    expect(prompt).toContain("Carruseles antes y después (visto en xataka.com.mx)");
  });

  it("concuerda el artículo con el formato", () => {
    expect(promptDePropuesta(item("x", "historia") as ConPropuesta)).toContain("una historia");
  });
});
