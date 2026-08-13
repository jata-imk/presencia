import { describe, expect, it } from "vitest";
import { currentCycleWindow } from "./cycle.js";

describe("currentCycleWindow", () => {
  it("usa el aniversario de este mes cuando ya pasó", () => {
    const anchor = new Date("2026-06-15T10:00:00Z");
    const now = new Date("2026-08-20T00:00:00Z");
    const { start, end } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe("2026-08-15T10:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("cae al mes anterior cuando el aniversario de este mes todavía no llega", () => {
    const anchor = new Date("2026-06-15T10:00:00Z");
    const now = new Date("2026-08-09T00:00:00Z");
    const { start, end } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe("2026-07-15T10:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-15T10:00:00.000Z");
  });

  it("clampea el día 31 a febrero (28 en año no bisiesto) una vez que ya pasó", () => {
    const anchor = new Date("2026-01-31T00:00:00Z");
    const now = new Date("2026-03-05T00:00:00Z");
    const { start, end } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    // Marzo tiene 31 días: el día de anclaje (31) ya no necesita clamp.
    expect(end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("antes del clamp de febrero, el ciclo vigente sigue siendo el de enero", () => {
    const anchor = new Date("2026-01-31T00:00:00Z");
    const now = new Date("2026-02-20T00:00:00Z");
    const { start, end } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clampea el día 31 a febrero bisiesto (29) una vez que ya pasó", () => {
    const anchor = new Date("2028-01-31T00:00:00Z");
    const now = new Date("2028-03-05T00:00:00Z");
    const { start } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("el ciclo de un usuario recién creado empieza en su propia fecha de alta", () => {
    const anchor = new Date("2026-08-09T12:00:00Z");
    const now = new Date("2026-08-09T12:00:05Z");
    const { start } = currentCycleWindow(anchor, now);
    expect(start.toISOString()).toBe(anchor.toISOString());
  });
});
