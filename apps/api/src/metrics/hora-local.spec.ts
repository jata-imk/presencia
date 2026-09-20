import { describe, expect, it } from "vitest";
import { fechaLocal } from "./hora-local.js";

// El bug que estas pruebas existen para impedir: agrupar por la hora UTC.
// Sin conversión, la noche del domingo en México aparece como madrugada del
// lunes, y el heatmap recomienda una hora a la que el usuario nunca publicó.

const MERIDA = "America/Mexico_City";

describe("fechaLocal", () => {
  it("la noche del domingo en México no es el lunes de UTC", () => {
    const instante = new Date("2026-09-21T01:00:00.000Z");
    expect(fechaLocal(instante, "UTC")).toEqual({ diaSemana: 0, hora: 1, dia: "2026-09-21" });
    expect(fechaLocal(instante, MERIDA)).toEqual({ diaSemana: 6, hora: 19, dia: "2026-09-20" });
  });

  it("cruza también hacia adelante", () => {
    const instante = new Date("2026-09-21T01:00:00.000Z");
    expect(fechaLocal(instante, "Asia/Tokyo")).toEqual({
      diaSemana: 0,
      hora: 10,
      dia: "2026-09-21",
    });
  });

  it("la medianoche local es la hora 0, nunca 24", () => {
    expect(fechaLocal(new Date("2026-09-21T06:00:00.000Z"), MERIDA).hora).toBe(0);
  });

  it("truena con una zona inválida en vez de caer a UTC en silencio", () => {
    // Una zona mal guardada produciría un heatmap desplazado que nadie
    // detecta: fallar ruidosamente es la única forma de enterarse.
    expect(() => fechaLocal(new Date(), "Mordor/Barad_dur")).toThrow();
  });
});
