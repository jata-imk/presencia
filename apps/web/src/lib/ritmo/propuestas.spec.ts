import { describe, expect, it } from "vitest";
import type { TrendItem } from "@presencia/shared";
import { elegirPropuestas, promptDePropuesta, type ConPropuesta } from "./propuestas.js";

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
