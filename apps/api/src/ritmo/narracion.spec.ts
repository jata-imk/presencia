import { describe, expect, it } from "vitest";
import type { RitmoHorariosDto, RitmoObjetivoDto } from "@presencia/shared";
import type { ResultadoCadencia } from "../metrics/metrics-engine.service.js";
import { armarPayload, promptDeNarracion } from "./narracion.js";

// Lo que se prueba acá es la frontera: qué números entran al payload y cuáles
// NO. El texto que el modelo devuelva no se puede probar, pero sí se puede
// probar que no le dimos materia prima para inventar.

function cadenciaCon(totales: readonly number[]): ResultadoCadencia {
  const dias = totales.map((total, indice) => ({
    dia: `2026-09-${String(indice + 1).padStart(2, "0")}`,
    total,
    porRed: { instagram: total },
  }));
  return {
    dias,
    total: totales.reduce((suma, n) => suma + n, 0),
    rachaActual: 3,
    mejorRacha: 9,
  };
}

function horariosCon(
  network: RitmoHorariosDto["network"],
  modo: RitmoHorariosDto["modo"],
  celdas: RitmoHorariosDto["celdas"],
): RitmoHorariosDto {
  return { network, modo, base: "tasa", ventanaDias: 30, nTotal: 40, celdas };
}

const CELDA_BUENA = { diaSemana: 2, franja: 6, n: 8, intensidad: 4, lift: 42, heredado: false };
const CELDA_MALA = { diaSemana: 0, franja: 1, n: 7, intensidad: 1, lift: -30, heredado: false };

const OBJETIVOS: RitmoObjetivoDto[] = [
  { network: "instagram", meta: 5, hechas: 3, sugerido: true },
  { network: "linkedin", meta: 2, hechas: 2, sugerido: false },
];

describe("armarPayload", () => {
  it("compara los últimos siete días contra los siete anteriores", () => {
    // 14 días: los primeros siete suman 7, los últimos siete suman 21.
    const payload = armarPayload(
      cadenciaCon([1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3]),
      OBJETIVOS,
      [],
    );
    expect(payload.previos7).toBe(7);
    expect(payload.ultimos7).toBe(21);
    expect(payload.totalPublicaciones).toBe(28);
  });

  it("no lleva la rejilla ni el heatmap, solo el resumen", () => {
    // El payload completo invitaría al modelo a buscarle patrones que nadie
    // calculó ("los martes rindes mejor") y que nadie puede defender.
    const payload = armarPayload(cadenciaCon(Array.from({ length: 112 }, () => 1)), OBJETIVOS, [
      horariosCon("instagram", "full", [CELDA_BUENA, CELDA_MALA]),
    ]);
    const plano = JSON.stringify(payload);
    expect(plano).not.toContain("2026-09-01");
    expect(plano).not.toContain("intensidad");
    expect(payload.semanas).toBe(16);
  });

  it("una ventana recomendada nunca sale de una celda con lift negativo", () => {
    // Una recomendación de dónde te va PEOR no es una recomendación.
    const payload = armarPayload(cadenciaCon([1, 2]), OBJETIVOS, [
      horariosCon("instagram", "full", [CELDA_MALA]),
    ]);
    expect(payload.ventanas).toHaveLength(0);
  });

  it("la ventana viaja como rango de tres horas, no como hora exacta", () => {
    const payload = armarPayload(cadenciaCon([1, 2]), OBJETIVOS, [
      horariosCon("instagram", "full", [CELDA_BUENA]),
    ]);
    expect(payload.ventanas).toEqual([
      { network: "instagram", franja: "18–21", lift: 42, heredado: false },
    ]);
  });

  it("una red que no llegó al umbral va a sinHorarios con su modo, no a ventanas", () => {
    // `poca` y `no_reporta` son hechos distintos —uno sobre el usuario, otro
    // sobre la red— y el prompt los trata distinto. Mezclarlos haría que el
    // modelo prometiera que una red que nunca da métricas "pronto" las dará.
    const payload = armarPayload(cadenciaCon([1, 2]), OBJETIVOS, [
      horariosCon("instagram", "full", [CELDA_BUENA]),
      horariosCon("linkedin", "no_reporta", []),
      horariosCon("facebook", "poca", []),
    ]);
    expect(payload.ventanas.map((v) => v.network)).toEqual(["instagram"]);
    expect(payload.sinHorarios).toEqual([
      { network: "linkedin", modo: "no_reporta" },
      { network: "facebook", modo: "poca" },
    ]);
  });

  it("las metas viajan con su bandera de sugerida", () => {
    // Un número que el producto propuso y uno que la persona eligió no son la
    // misma promesa: sin la bandera, el modelo regañaría por incumplir una
    // meta que el usuario nunca aceptó.
    const payload = armarPayload(cadenciaCon([1]), OBJETIVOS, []);
    expect(payload.objetivos).toEqual([
      { network: "instagram", meta: 5, hechas: 3, sugerido: true },
      { network: "linkedin", meta: 2, hechas: 2, sugerido: false },
    ]);
  });
});

describe("promptDeNarracion", () => {
  const payload = armarPayload(cadenciaCon([1, 2, 3]), OBJETIVOS, [
    horariosCon("instagram", "full", [CELDA_BUENA]),
  ]);

  it("lleva los números adentro y prohíbe inventar otros", () => {
    const prompt = promptDeNarracion(payload, "Jose");
    expect(prompt).toContain('"rachaActual": 3');
    expect(prompt).toContain("NO inventes ningún número");
  });

  it("fija el registro cultural, incluido lo que está prohibido decir", () => {
    const prompt = promptDeNarracion(payload, "Jose");
    expect(prompt).toContain("español de México");
    expect(prompt).toMatch(/tuteando|tuteo/);
    expect(prompt).toContain("querés");
  });
});
