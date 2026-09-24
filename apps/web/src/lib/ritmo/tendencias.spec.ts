import { describe, expect, it } from "vitest";
import { botonDeRefresco, haceCuanto } from "./tendencias.js";

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
    const boton = botonDeRefresco({ enCurso: false, disponible: true, costoPorcentaje: 0 });
    expect(boton).toEqual({
      etiqueta: "Buscar tendencias",
      precio: null,
      deshabilitado: false,
      motivo: null,
    });
  });

  it("cobrable dice su precio en porcentaje del mes", () => {
    const boton = botonDeRefresco({ enCurso: false, disponible: true, costoPorcentaje: 2.7 });
    expect(boton.etiqueta).toBe("Actualizar ahora");
    expect(boton.precio).toBe("usa ~2.7% de tu mes");
  });

  it("un precio chico no se redondea a cero", () => {
    // La API nunca manda menos de 0.1 para algo que cobra; "0%" sería mentir.
    expect(botonDeRefresco({ enCurso: false, disponible: true, costoPorcentaje: 0.1 }).precio).toBe(
      "usa ~0.1% de tu mes",
    );
  });

  it("sin saldo se apaga y dice por qué", () => {
    const boton = botonDeRefresco({ enCurso: false, disponible: false, costoPorcentaje: 2.7 });
    expect(boton.deshabilitado).toBe(true);
    expect(boton.motivo).toBe("Tu saldo del mes no alcanza");
  });

  it("en curso dice Buscando… y no anuncia precio", () => {
    const boton = botonDeRefresco({ enCurso: true, disponible: false, costoPorcentaje: 2.7 });
    expect(boton).toMatchObject({ etiqueta: "Buscando…", precio: null, deshabilitado: true });
  });
});
