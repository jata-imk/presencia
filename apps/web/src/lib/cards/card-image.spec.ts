import { describe, expect, it } from "vitest";
import type { CardImageJob } from "@presencia/shared";
import { effectiveImageJob, imageFileProblem, missingImageNote } from "./card-image.js";

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

describe("effectiveImageJob", () => {
  const job = (startedAt: string): CardImageJob => ({
    id: "j",
    status: "generating",
    provider: "primary",
    kind: "generate",
    aspectRatio: "4:5",
    assetIds: [],
    startedAt,
  });
  const t0 = Date.parse("2026-09-27T12:00:00Z");

  it("un trabajo reciente sigue generando", () => {
    expect(effectiveImageJob(job("2026-09-27T12:00:00Z"), t0 + 60_000)?.status).toBe("generating");
  });

  it("pasados 5 minutos se muestra fallido aunque la API no haya escrito nada", () => {
    expect(effectiveImageJob(job("2026-09-27T12:00:00Z"), t0 + 5 * 60_000 + 1)?.status).toBe(
      "failed",
    );
  });
});
