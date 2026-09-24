import { describe, expect, it } from "vitest";
import { falloVigente } from "./estado.js";

const CUANDO = new Date("2026-09-24T19:57:35.000Z");
const ANTES = new Date("2026-09-24T12:00:00.000Z");
const DESPUES = new Date("2026-09-25T05:15:00.000Z");

describe("falloVigente", () => {
  it("sin refrescos no hay nada que contar", () => {
    expect(falloVigente(null, null)).toBeNull();
  });

  it("un error sin tanda se cuenta", () => {
    expect(falloVigente({ outcome: "error", settledAt: CUANDO }, null)).toEqual({
      motivo: "error",
      en: CUANDO.toISOString(),
    });
  });

  it("abandonado se dice como error", () => {
    expect(falloVigente({ outcome: "abandonado", settledAt: CUANDO }, null)?.motivo).toBe("error");
  });

  it("sin resultados sobre una tanda anterior se cuenta aparte", () => {
    expect(
      falloVigente({ outcome: "sin_resultados", settledAt: CUANDO }, { generatedAt: ANTES })
        ?.motivo,
    ).toBe("sin_resultados");
  });

  it("una tanda más nueva que el fallo lo deja atrás", () => {
    expect(
      falloVigente({ outcome: "error", settledAt: CUANDO }, { generatedAt: DESPUES }),
    ).toBeNull();
  });

  it.each(["cobrado", "gratis", "no_encolado", null])("%s no es un fallo que contar", (outcome) => {
    expect(falloVigente({ outcome, settledAt: CUANDO }, null)).toBeNull();
  });
});
