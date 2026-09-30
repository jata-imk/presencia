import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CARD_ARCHETYPE_TOOLS,
  FIRST_SLIDE_ID,
  placeImage,
  slidesOf,
  withSlides,
  type CardContent,
} from "@presencia/shared";

// Las reglas del carrusel (F10.6, packages/shared/src/carousel.ts), sin DB:
// cómo se deriva `assetIds` de los slides y cuándo una card deja de ser
// carrusel. Los endpoints que las usan se prueban en card-media.service.spec.

const SINGLE: CardContent = {
  archetype: "visual_first",
  caption: "c",
  hashtags: [],
  imagePrompt: "portada",
  assetIds: [],
};

describe("carrusel", () => {
  it("assetIds es la lista de imágenes de los slides, en orden y sin huecos", () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const content = withSlides(SINGLE, [
      { id: randomUUID(), assetId: a },
      { id: randomUUID() },
      { id: randomUUID(), assetId: b },
    ]);
    expect(content.assetIds).toEqual([a, b]);
  });

  it("una imagen suelta se ve como carrusel de uno, con id fijo", () => {
    const a = randomUUID();
    expect(slidesOf({ ...SINGLE, assetIds: [a] })).toEqual([
      { id: FIRST_SLIDE_ID, imagePrompt: "portada", assetId: a },
    ]);
  });

  it("al volver a imagen suelta, un slide sin prompt no hereda el de la portada quitada", () => {
    const content = withSlides(SINGLE, [{ id: randomUUID() }]);
    expect(content).not.toHaveProperty("imagePrompt");
  });

  it("con un solo slide deja de ser carrusel y conserva su prompt y su imagen", () => {
    const a = randomUUID();
    const content = withSlides(SINGLE, [{ id: randomUUID(), imagePrompt: "quedó", assetId: a }]);
    expect(content).not.toHaveProperty("slides");
    expect(content).toMatchObject({ imagePrompt: "quedó", assetIds: [a] });
  });

  it("placeImage: en un carrusel va al slide pedido, o a la portada; un slide que no existe no recibe nada", () => {
    const [s1, s2, a] = [randomUUID(), randomUUID(), randomUUID()];
    const carousel = withSlides(SINGLE, [{ id: s1 }, { id: s2 }]);
    expect(placeImage(carousel, a, s2).assetIds).toEqual([a]);
    expect(placeImage(carousel, a).assetIds).toEqual([a]);
    expect(placeImage(carousel, a, s2)).toMatchObject({
      slides: [{ id: s1 }, { id: s2, assetId: a }],
    });
    expect(placeImage(carousel, a, randomUUID())).toEqual(carousel);
    // En una imagen suelta reemplaza la imagen; un slide ajeno no aplica.
    expect(placeImage(SINGLE, a).assetIds).toEqual([a]);
    expect(placeImage(SINGLE, a, randomUUID())).toEqual(SINGLE);
  });

  it("las tools reciben prompts, no `slides`: los ids y las imágenes son de la app", () => {
    for (const tool of CARD_ARCHETYPE_TOOLS) {
      const parsed = tool.inputSchema.safeParse({
        network:
          tool.archetype === "text_first"
            ? "linkedin"
            : tool.archetype === "visual_first"
              ? "instagram"
              : "tiktok",
        caption: "c",
        body: "b",
        hook: "h",
        script: "s",
        hashtags: [],
        slides: [{ id: randomUUID() }, { id: randomUUID() }],
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data).not.toHaveProperty("slides");
    }
  });

  const visualTool = CARD_ARCHETYPE_TOOLS.find((t) => t.archetype === "visual_first")!;
  const textTool = CARD_ARCHETYPE_TOOLS.find((t) => t.archetype === "text_first")!;
  const build = (tool: typeof visualTool, input: Record<string, unknown>) =>
    tool.buildContent(tool.inputSchema.parse(input));

  it("el chat propone un carrusel: un slide por prompt, el primero de portada", () => {
    const content = build(visualTool, {
      network: "instagram",
      caption: "c",
      hashtags: [],
      carouselImagePrompts: ["portada", "paso 1", "paso 2"],
    });
    expect(content).toMatchObject({
      imagePrompt: "portada",
      assetIds: [],
      slides: [{ imagePrompt: "portada" }, { imagePrompt: "paso 1" }, { imagePrompt: "paso 2" }],
    });
    expect(content).not.toHaveProperty("carouselImagePrompts");
  });

  it("respeta el tope de la red y un solo prompt no es carrusel", () => {
    const x = build(textTool, {
      network: "x",
      body: "b",
      hashtags: [],
      carouselImagePrompts: ["1", "2", "3", "4", "5", "6"],
    });
    expect(x.archetype !== "video_script" && x.slides).toHaveLength(4);
    const one = build(visualTool, {
      network: "facebook",
      caption: "c",
      hashtags: [],
      carouselImagePrompts: ["solo una"],
    });
    expect(one).not.toHaveProperty("slides");
    expect(one).toMatchObject({ imagePrompt: "solo una" });
  });
});
