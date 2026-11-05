import { describe, expect, it } from "vitest";
import { formatMinSec } from "./format-duration.js";

describe("formatMinSec", () => {
  it("da m:ss", () => {
    expect(formatMinSec(42)).toBe("0:42");
    expect(formatMinSec(600)).toBe("10:00");
    expect(formatMinSec(872)).toBe("14:32");
  });

  it("redondea hacia arriba y nunca baja de cero", () => {
    expect(formatMinSec(0.2)).toBe("0:01");
    expect(formatMinSec(-3)).toBe("0:00");
  });
});
