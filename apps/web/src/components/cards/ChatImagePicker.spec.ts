import { afterEach, describe, expect, it, vi } from "vitest";
import { sentAtLabel } from "./ChatImagePicker.js";

describe("sentAtLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // 19 de octubre, 12:00 en Mérida (UTC−6).
  const now = new Date("2026-10-19T18:00:00.000Z");
  const zone = "America/Merida";

  it("hoy y ayer con la hora; antes, la fecha corta", () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    expect(sentAtLabel("2026-10-19T16:42:00.000Z", zone)).toBe("Hoy 10:42");
    expect(sentAtLabel("2026-10-19T00:05:00.000Z", zone)).toBe("Ayer 18:05");
    expect(sentAtLabel("2026-10-12T18:00:00.000Z", zone)).toMatch(/^12 oct$/);
    // De otro año, con el año: si no, se confunde con la de la semana pasada.
    expect(sentAtLabel("2025-10-12T18:00:00.000Z", zone)).toMatch(/^12 oct 2025$/);
  });

  it("el día es el de la zona del creator, no el de UTC", () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    // 03:00 UTC del 19 todavía es el 18 en Mérida.
    expect(sentAtLabel("2026-10-19T03:00:00.000Z", zone)).toBe("Ayer 21:00");
  });
});
