import { describe, expect, it } from "vitest";
import { normalizeExpression } from "@presencia/shared";

// El primitivo del que dependen el catálogo de verticales y la resolución de
// modismos prohibidos, y que hasta ahora no tenía prueba propia: si dejara de
// quitar acentos, "café" y "cafe" pasarían a ser modismos distintos y media
// tabla de keywords se volvería inalcanzable, todo en silencio.

describe("normalizeExpression", () => {
  it("quita acentos, espacios y mayúsculas", () => {
    expect(normalizeExpression("  CaFÉ  ")).toBe("cafe");
    expect(normalizeExpression("Repostería")).toBe("reposteria");
    expect(normalizeExpression("Diseño")).toBe("diseno");
  });

  it("deja igual lo que ya estaba normalizado", () => {
    expect(normalizeExpression("marketing")).toBe("marketing");
  });

  it("no rompe con cadena vacía", () => {
    expect(normalizeExpression("   ")).toBe("");
  });
});
