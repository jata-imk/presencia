import { describe, expect, it } from "vitest";
import type { TrendItem } from "@presencia/shared";
import { flatActionPercentOfQuota, quoteFlatAction } from "../credits/rate-card.js";
import { esCobrable } from "./cobro.js";

// La regla del cobro del refresco manual, aislada de la búsqueda y de la base.
//
// Vale la pena probarla sola porque no es una condición técnica sino una
// decisión de producto: **se cobra adelantar tendencias que el usuario ya
// tiene**. Todo lo demás es gratis, y cada forma de "no tenerlas" es un caso
// que alguien podría romper sin darse cuenta al tocar otra cosa.

const AHORA = new Date("2026-09-24T12:00:00.000Z");
const EN_UNA_SEMANA = new Date("2026-10-01T12:00:00.000Z");
const AYER = new Date("2026-09-23T12:00:00.000Z");

const ITEM: TrendItem = {
  topic: "Carruseles antes y después",
  signal: "rising",
  network: "instagram",
  format: "carrusel",
  blurb: "El formato lado a lado se está moviendo en cuentas de diseño.",
  sourceTitle: "ejemplo.mx",
  sourceUrl: "https://ejemplo.mx/tendencias",
};

describe("esCobrable", () => {
  it("cobra cuando hay una tanda vigente con tendencias", () => {
    expect(esCobrable({ items: [ITEM], generatedAt: AYER, expiresAt: EN_UNA_SEMANA }, AHORA)).toBe(
      true,
    );
  });

  it("no cobra la primera entrega", () => {
    // Sin tanda el usuario no está adelantando nada: está esperando lo que el
    // barrido todavía no le trajo.
    expect(esCobrable(null, AHORA)).toBe(false);
  });

  it("no cobra cuando la tanda ya venció", () => {
    // Refrescarla es trabajo que el negocio ya le debe; el barrido lo haría
    // igual dentro del día.
    expect(esCobrable({ items: [ITEM], generatedAt: AYER, expiresAt: AYER }, AHORA)).toBe(false);
  });

  it("no cobra cuando la tanda vigente está vacía", () => {
    // Este es el caso que obliga a mirar `items` y no solo la fecha:
    // `marcarIntento` mueve el vencimiento 12 horas cuando una búsqueda no
    // encuentra nada citable. Sin esta línea, una búsqueda fallida dejaba una
    // tanda "vigente" y el siguiente click cobraba por tendencias que el
    // usuario nunca vio.
    expect(esCobrable({ items: [], generatedAt: AYER, expiresAt: EN_UNA_SEMANA }, AHORA)).toBe(
      false,
    );
  });
});

describe("el precio que se le anuncia al usuario", () => {
  it("nunca viaja en unidades crudas", () => {
    // La web solo ve objeto contable (addendum ADR-012). Acá se verifica que
    // la traducción existe y da algo que se puede pintar en un botón: un
    // porcentaje chico pero distinto de cero.
    const porcentaje = flatActionPercentOfQuota("trend_refresh", "creator");
    expect(porcentaje).toBeGreaterThan(0);
    expect(porcentaje).toBeLessThan(10);
  });

  it("pesa menos en un plan más grande", () => {
    const creator = flatActionPercentOfQuota("trend_refresh", "creator");
    const agencia = flatActionPercentOfQuota("trend_refresh", "agencia");
    expect(agencia).toBeLessThan(creator);
  });

  it("nunca se redondea a cero", () => {
    // "0%" en un botón que cobra es mentira, aunque sea de redondeo. El caso
    // real es el plan más grande, donde un refresco es una fracción mínima.
    expect(flatActionPercentOfQuota("trend_refresh", "agencia")).toBeGreaterThanOrEqual(0.1);
  });

  it("el refresco tiene tarifa fija, no por tokens", () => {
    // Si alguien la sacara de `flat`, esto truena en vez de cobrar 0 en
    // silencio: el fee del grounding se cobra por consulta de búsqueda, así
    // que cobrarlo por tokens subestimaría justo la parte cara.
    expect(quoteFlatAction("trend_refresh")).toBeGreaterThan(0);
  });
});
