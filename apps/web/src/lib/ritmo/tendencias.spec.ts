import { describe, expect, it } from "vitest";
import type { TrendItem, TrendsDto } from "@presencia/shared";
import { avisoDeUltimaBusqueda, botonDeRefresco, haceCuanto } from "./tendencias.js";

const AHORA = new Date("2026-09-24T12:00:00.000Z");
const antes = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();

describe("haceCuanto", () => {
  it.each([
    [20 * 1000, "hace un momento"],
    [5 * 60 * 1000, "hace 5 minutos"],
    [3 * 60 * 60 * 1000, "hace 3 horas"],
    [30 * 60 * 60 * 1000, "ayer"],
    [3 * 24 * 60 * 60 * 1000, "hace 3 días"],
  ])("%d ms → %s", (ms, esperado) => {
    expect(haceCuanto(antes(ms), AHORA)).toBe(esperado);
  });
});

describe("botonDeRefresco", () => {
  it("gratis no anuncia precio", () => {
    const boton = botonDeRefresco({
      enCurso: false,
      disponible: true,
      costoPorcentaje: 0,
      bloqueo: null,
      ultimoFallo: null,
    });
    expect(boton).toEqual({
      etiqueta: "Buscar tendencias",
      precio: null,
      deshabilitado: false,
      motivo: null,
    });
  });

  it("cobrable dice su precio en porcentaje del mes", () => {
    const boton = botonDeRefresco({
      enCurso: false,
      disponible: true,
      costoPorcentaje: 2.7,
      bloqueo: null,
      ultimoFallo: null,
    });
    expect(boton.etiqueta).toBe("Actualizar ahora");
    expect(boton.precio).toBe("usa ~2.7% de tu mes");
  });

  it("un precio chico no se redondea a cero", () => {
    // La API nunca manda menos de 0.1 para algo que cobra; "0%" sería mentir.
    expect(
      botonDeRefresco({
        enCurso: false,
        disponible: true,
        costoPorcentaje: 0.1,
        bloqueo: null,
        ultimoFallo: null,
      }).precio,
    ).toBe("usa ~0.1% de tu mes");
  });

  it("sin saldo se apaga y dice por qué", () => {
    const boton = botonDeRefresco({
      enCurso: false,
      disponible: false,
      costoPorcentaje: 2.7,
      bloqueo: "sin_saldo",
      ultimoFallo: null,
    });
    expect(boton.deshabilitado).toBe(true);
    expect(boton.motivo).toBe("Tu saldo del mes no alcanza");
  });

  it("al tope de búsquedas gratis se apaga, sin precio y diciendo por qué", () => {
    const boton = botonDeRefresco({
      enCurso: false,
      disponible: false,
      costoPorcentaje: 0,
      bloqueo: "tope_diario",
      ultimoFallo: null,
    });
    expect(boton).toMatchObject({
      etiqueta: "Buscar tendencias",
      precio: null,
      deshabilitado: true,
    });
    expect(boton.motivo).toBe(
      "Ya buscamos 3 veces en las últimas 24 horas; lo volvemos a intentar solos",
    );
  });

  it("en curso dice Buscando… y no anuncia precio", () => {
    const boton = botonDeRefresco({
      enCurso: true,
      disponible: false,
      costoPorcentaje: 2.7,
      bloqueo: null,
      ultimoFallo: null,
    });
    expect(boton).toMatchObject({ etiqueta: "Buscando…", precio: null, deshabilitado: true });
  });
});

describe("avisoDeUltimaBusqueda", () => {
  const ITEM = {
    topic: "Tema",
    signal: "rising",
    network: "tiktok",
    format: "reel",
    blurb: "Se mueve.",
    sourceTitle: "x.mx",
    sourceUrl: "https://x.mx/a",
  } satisfies TrendItem;

  function datos(
    ultimoFallo: TrendsDto["refresco"]["ultimoFallo"],
    items: TrendItem[] = [],
    enCurso = false,
  ): TrendsDto {
    return {
      vertical: "tech",
      region: "sureste",
      items,
      generatedAt: null,
      expiresAt: null,
      personalizada: false,
      refresco: { enCurso, disponible: !enCurso, costoPorcentaje: 0, bloqueo: null, ultimoFallo },
    };
  }
  const EN = "2026-09-24T19:57:35.000Z";

  it("sin fallo no dice nada", () => {
    expect(avisoDeUltimaBusqueda(datos(null))).toBeNull();
  });

  it("un error sobre tarjetas anteriores se dice, aclarando que no se cobró", () => {
    expect(avisoDeUltimaBusqueda(datos({ motivo: "error", en: EN }, [ITEM]))).toBe(
      "La última búsqueda falló. No se te cobró; te dejamos las anteriores.",
    );
  });

  it("sin resultados sobre tarjetas anteriores también se dice", () => {
    expect(avisoDeUltimaBusqueda(datos({ motivo: "sin_resultados", en: EN }, [ITEM]))).toMatch(
      /no encontró nada nuevo/,
    );
  });

  it("sin tarjetas no dice nada: lo cuenta el estado vacío", () => {
    expect(avisoDeUltimaBusqueda(datos({ motivo: "error", en: EN }))).toBeNull();
    expect(avisoDeUltimaBusqueda(datos({ motivo: "sin_resultados", en: EN }))).toBeNull();
  });

  it("mientras corre otra búsqueda no habla de la anterior", () => {
    expect(avisoDeUltimaBusqueda(datos({ motivo: "error", en: EN }, [ITEM], true))).toBeNull();
  });
});
