import { describe, expect, it } from "vitest";
import { haceCuanto } from "./relative-time.js";

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
