import { describe, expect, it } from "vitest";
import { FIRST_SLIDE_ID, type CardImageVersionDto } from "@presencia/shared";
import { versionsOfSlide } from "./slide-versions.js";

const COVER = FIRST_SLIDE_ID;
const SECOND = "00000000-0000-4000-8000-0000000000a2";

function version(
  assetId: string,
  slideId: string | null,
  croppedFrom: string | null = null,
): CardImageVersionDto {
  return {
    assetId,
    source: "generated",
    kind: "generate",
    instruction: null,
    parentAssetId: null,
    alt: null,
    slideId,
    croppedFrom,
    createdAt: "2026-10-04T00:00:00.000Z",
  };
}

const all = [version("a", COVER), version("b", SECOND), version("c", null), version("d", SECOND)];

describe("versionsOfSlide", () => {
  it("un slide ve solo las suyas", () => {
    const ids = versionsOfSlide(all, { id: SECOND, assetId: "d" }).map((v) => v.assetId);
    expect(ids).toEqual(["b", "d"]);
  });

  it("las de antes de anotar el slide (null) son de FIRST_SLIDE_ID", () => {
    const ids = versionsOfSlide(all, { id: COVER, assetId: "a" }).map((v) => v.assetId);
    expect(ids).toEqual(["a", "c"]);
  });

  it("las null siguen a FIRST_SLIDE_ID aunque otro slide sea la portada", () => {
    // Un slide nuevo hecho portada no se lleva el historial viejo.
    const ids = versionsOfSlide(all, { id: SECOND, assetId: "d" }).map((v) => v.assetId);
    expect(ids).not.toContain("c");
  });

  it("la imagen que el slide tiene ahora siempre está, aunque sea de otro", () => {
    const ids = versionsOfSlide(all, { id: SECOND, assetId: "a" }).map((v) => v.assetId);
    expect(ids).toEqual(["a", "b", "d"]);
  });

  it("un slide sin imagen ni historial no ve nada", () => {
    expect(versionsOfSlide(all, { id: "otro" })).toEqual([]);
  });

  it("una imagen y sus recortes de proporción son una sola versión", () => {
    // "o" original; "o1" su recorte 1:1 y "o2" el 4:5 de después; "p" otra imagen.
    const list = [
      version("o", SECOND),
      version("p", SECOND),
      version("o1", SECOND, "o"),
      version("o2", SECOND, "o"),
    ];
    // Sin ninguna del grupo elegida: queda la más nueva, en el lugar de la original.
    expect(versionsOfSlide(list, { id: SECOND, assetId: "p" }).map((v) => v.assetId)).toEqual([
      "o2",
      "p",
    ]);
    // Con una del grupo elegida: queda esa.
    expect(versionsOfSlide(list, { id: SECOND, assetId: "o1" }).map((v) => v.assetId)).toEqual([
      "o1",
      "p",
    ]);
  });
});
