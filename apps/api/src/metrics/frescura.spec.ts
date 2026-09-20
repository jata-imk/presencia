import { describe, expect, it } from "vitest";
import { debeMedirse, diaUtc } from "./frescura.js";

// Función pura y sin red: la política se prueba con fechas fijas, que es la
// única forma de cubrir los cuatro tramos sin esperar semanas.

const AHORA = new Date("2026-09-18T06:00:00.000Z");

function haceDias(dias: number): Date {
  return new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);
}

describe("debeMedirse", () => {
  it("un post nunca medido entra siempre, esté donde esté de la ventana", () => {
    for (const dias of [0, 1, 10, 29]) {
      expect(debeMedirse({ publishedAt: haceDias(dias), ultimoSnapshot: null, ahora: AHORA })).toBe(
        true,
      );
    }
  });

  // Las primeras horas son las que traen la señal, así que ahí se paga la
  // cuota de medir en cada pase aunque ya haya fila de hoy.
  it("en las primeras 48 h entra en cada pase, aunque ya se haya medido hoy", () => {
    expect(
      debeMedirse({
        publishedAt: haceDias(1),
        ultimoSnapshot: diaUtc(AHORA),
        ahora: AHORA,
      }),
    ).toBe(true);
  });

  it("entre 2 y 14 días, una vez al día", () => {
    const publishedAt = haceDias(5);
    expect(debeMedirse({ publishedAt, ultimoSnapshot: diaUtc(AHORA), ahora: AHORA })).toBe(false);
    expect(debeMedirse({ publishedAt, ultimoSnapshot: "2026-09-17", ahora: AHORA })).toBe(true);
  });

  it("entre 14 y 30 días, una vez por semana", () => {
    const publishedAt = haceDias(20);
    expect(debeMedirse({ publishedAt, ultimoSnapshot: "2026-09-15", ahora: AHORA })).toBe(false);
    expect(debeMedirse({ publishedAt, ultimoSnapshot: "2026-09-11", ahora: AHORA })).toBe(true);
  });

  it("pasados 30 días ya no se mide, ni siquiera si nunca se midió", () => {
    expect(debeMedirse({ publishedAt: haceDias(31), ultimoSnapshot: null, ahora: AHORA })).toBe(
      false,
    );
  });

  // Un published_at en el futuro (reloj torcido) daría edad negativa. No
  // debe caerse de la ventana por el lado equivocado.
  it("un published_at futuro se trata como recién publicado", () => {
    expect(
      debeMedirse({ publishedAt: haceDias(-2), ultimoSnapshot: diaUtc(AHORA), ahora: AHORA }),
    ).toBe(true);
  });

  // El día es UTC en toda la fase: si acá se usara la fecha local del
  // servidor, el corte de "ya lo medí hoy" caería en otro momento que el que
  // usa el índice único, y habría pases de más o de menos.
  it("el día se calcula en UTC", () => {
    expect(diaUtc(new Date("2026-09-18T23:30:00.000Z"))).toBe("2026-09-18");
    expect(diaUtc(new Date("2026-09-19T00:30:00.000Z"))).toBe("2026-09-19");
  });
});
