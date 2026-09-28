import { describe, expect, it } from "vitest";
import { imageFileProblem, missingImageNote } from "./card-image.js";

describe("imageFileProblem", () => {
  it("acepta JPG, PNG y WebP hasta 10 MB", () => {
    expect(imageFileProblem({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(imageFileProblem({ type: "image/webp", size: 10 * 1024 * 1024 })).toBeNull();
  });

  it("rechaza otros formatos", () => {
    expect(imageFileProblem({ type: "image/gif", size: 10 })).toMatch(/JPG, PNG o WebP/);
    expect(imageFileProblem({ type: "application/pdf", size: 10 })).toMatch(/JPG, PNG o WebP/);
  });

  it("dice cuánto pesa lo que se pasa, con tuteo", () => {
    expect(imageFileProblem({ type: "image/png", size: 14 * 1024 * 1024 })).toBe(
      "El límite es 10 MB. Tu archivo pesa 14 MB. Prueba comprimirlo o sube uno más pequeño.",
    );
  });
});

describe("missingImageNote", () => {
  it("no le dice a Facebook que necesita imagen: sin ella publica solo el texto", () => {
    expect(missingImageNote("facebook")).toMatch(/solo el texto/);
    expect(missingImageNote("facebook")).not.toMatch(/necesita/);
    expect(missingImageNote("instagram")).toMatch(/necesita/);
  });
});
