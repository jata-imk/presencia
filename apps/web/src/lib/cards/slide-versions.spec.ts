import { describe, expect, it } from "vitest";
import type { CardImageVersionDto } from "@presencia/shared";
import { versionsOfSlide } from "./slide-versions.js";

const COVER = "00000000-0000-4000-8000-0000000000a1";
const SECOND = "00000000-0000-4000-8000-0000000000a2";

function version(assetId: string, slideId: string | null): CardImageVersionDto {
  return {
    assetId,
    source: "generated",
    kind: "generate",
    instruction: null,
    parentAssetId: null,
    alt: null,
    slideId,
    createdAt: "2026-10-04T00:00:00.000Z",
  };
}

const all = [version("a", COVER), version("b", SECOND), version("c", null), version("d", SECOND)];

describe("versionsOfSlide", () => {
  it("un slide ve solo las suyas", () => {
    const ids = versionsOfSlide(all, { id: SECOND, assetId: "d" }, 1).map((v) => v.assetId);
    expect(ids).toEqual(["b", "d"]);
  });

  it("las de antes de anotar el slide (null) son de la portada", () => {
    const ids = versionsOfSlide(all, { id: COVER, assetId: "a" }, 0).map((v) => v.assetId);
    expect(ids).toEqual(["a", "c"]);
  });

  it("el slide que deja de ser portada no se lleva las null", () => {
    const ids = versionsOfSlide(all, { id: COVER, assetId: "a" }, 1).map((v) => v.assetId);
    expect(ids).toEqual(["a"]);
  });

  it("la imagen que el slide tiene ahora siempre está, aunque sea de otro", () => {
    const ids = versionsOfSlide(all, { id: SECOND, assetId: "a" }, 1).map((v) => v.assetId);
    expect(ids).toEqual(["a", "b", "d"]);
  });

  it("un slide sin imagen ni historial no ve nada", () => {
    expect(versionsOfSlide(all, { id: "otro" }, 2)).toEqual([]);
  });
});
