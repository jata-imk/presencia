import { describe, expect, it, vi } from "vitest";
import { TurnCards } from "./turn-cards.js";

describe("TurnCards", () => {
  it("junta las cards del turno mientras está abierto", () => {
    const cards = new TurnCards();
    cards.add("a");
    cards.add("b");
    expect(cards.ids).toEqual(["a", "b"]);
  });

  it("al cerrarse, entrega a `late` solo las que llegan después", () => {
    const cards = new TurnCards();
    const late = vi.fn();
    cards.add("a");
    cards.close(late);
    expect(late).not.toHaveBeenCalled();

    cards.add("tardía");
    expect(late).toHaveBeenCalledExactlyOnceWith("tardía");
    expect(cards.ids).toEqual(["a", "tardía"]);
  });
});
