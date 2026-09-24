import { describe, expect, it } from "vitest";
import {
  MAX_TREND_SOURCES,
  MAX_TREND_TEXT,
  normalizeTrendSource,
  updateTrendSettingsBodySchema,
} from "@presencia/shared";

// El contrato del guardado de Configuración › Tendencias, que decide qué
// llega a `trend_sources` y a la voz. Puro. Vive en la api porque shared no
// tiene runner de tests (mismo arreglo que brand-voice/text.spec.ts).

describe("normalizeTrendSource", () => {
  it.each([
    ["canal10.tv", "canal10.tv"],
    ["https://www.Canal10.tv/nota/123?x=1", "canal10.tv"],
    ["  WWW.xataka.com.mx  ", "xataka.com.mx"],
    ["http://blog.ejemplo.mx", "blog.ejemplo.mx"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizeTrendSource(entrada)).toBe(esperado);
  });

  it.each(["", "   ", "no es un sitio", "localhost", "https://", "canal10"])(
    "rechaza %j",
    (entrada) => {
      expect(normalizeTrendSource(entrada)).toBeNull();
    },
  );
});

const VALIDO = { fuentes: [], prompt: null, excluye: null, langs: ["es"] };

describe("updateTrendSettingsBodySchema", () => {
  it("acepta no personalizar nada", () => {
    expect(updateTrendSettingsBodySchema.safeParse(VALIDO).success).toBe(true);
  });

  it("normaliza las fuentes y colapsa las que resultan iguales", () => {
    const parsed = updateTrendSettingsBodySchema.parse({
      ...VALIDO,
      fuentes: ["https://www.canal10.tv/x", "canal10.tv", "xataka.com.mx"],
    });
    expect(parsed.fuentes).toEqual(["canal10.tv", "xataka.com.mx"]);
  });

  it("una fuente que no es un sitio se rechaza nombrándola", () => {
    const parsed = updateTrendSettingsBodySchema.safeParse({ ...VALIDO, fuentes: ["mi tío"] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("mi tío");
  });

  it(`no pasa de ${String(MAX_TREND_SOURCES)} fuentes`, () => {
    const fuentes = Array.from({ length: MAX_TREND_SOURCES + 1 }, (_, i) => `f${String(i)}.mx`);
    expect(updateTrendSettingsBodySchema.safeParse({ ...VALIDO, fuentes }).success).toBe(false);
  });

  it("exige al menos un idioma y quita los repetidos", () => {
    expect(updateTrendSettingsBodySchema.safeParse({ ...VALIDO, langs: [] }).success).toBe(false);
    expect(updateTrendSettingsBodySchema.parse({ ...VALIDO, langs: ["en", "en"] }).langs).toEqual([
      "en",
    ]);
  });

  it("recorta los textos y respeta su tope", () => {
    expect(updateTrendSettingsBodySchema.parse({ ...VALIDO, prompt: "  IA  " }).prompt).toBe("IA");
    const largo = "a".repeat(MAX_TREND_TEXT + 1);
    expect(updateTrendSettingsBodySchema.safeParse({ ...VALIDO, excluye: largo }).success).toBe(
      false,
    );
  });
});
