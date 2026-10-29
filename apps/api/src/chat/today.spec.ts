import { describe, expect, it } from "vitest";
import { localDateLabel, todayInstruction } from "./today.js";

// F10.10: la fecha de hoy en el prompt, en el día LOCAL del creator.

describe("localDateLabel", () => {
  // 2026-10-29 03:30 UTC = 28 de octubre, 21:30 en Mérida (UTC-6, sin horario de verano desde 2022).
  const night = new Date("2026-10-29T03:30:00Z");

  it("usa el día del creator, no el de UTC", () => {
    expect(localDateLabel(night, "America/Merida")).toBe("miércoles, 28 de octubre de 2026");
    expect(localDateLabel(night, "UTC")).toBe("jueves, 29 de octubre de 2026");
  });

  it("una zona inválida cae al default sin tumbar el turno", () => {
    expect(localDateLabel(night, "Mars/Olympus")).toBe("miércoles, 28 de octubre de 2026");
  });
});

describe("todayInstruction", () => {
  it("dice la fecha y que lo de otra fecha no se presenta como actual", () => {
    const text = todayInstruction(new Date("2026-10-28T18:00:00Z"), "America/Merida");
    expect(text).toContain("Hoy es miércoles, 28 de octubre de 2026");
    expect(text).toContain("este fin de semana");
    expect(text).toContain("No lo presentes como actual");
  });
});
