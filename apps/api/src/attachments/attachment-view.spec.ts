import { describe, expect, it } from "vitest";
import {
  parsePageRange,
  sameAttachmentName,
  pdfPages,
  textView,
  viewCost,
  VIEW_TEXT_CHARS,
  type ViewableAttachment,
} from "./attachment-view.js";

// F10.11: qué se ve de un adjunto al volver a verlo.

const pdf = (pages: string[], over: Partial<ViewableAttachment> = {}): ViewableAttachment => ({
  kind: "pdf",
  pages: pages.length,
  scanned: false,
  extractedText: pages.map((text, i) => `[Página ${String(i + 1)}]\n${text}`).join("\n\n"),
  truncated: false,
  tokenEstimate: 100,
  ...over,
});

const MENU = pdf(["Portada", "Desayunos", "Antojitos", "Pan de cazón: $145", "Bebidas", "Postres"]);

describe("parsePageRange", () => {
  it("entiende una página, un rango con guion, con raya o con 'a'", () => {
    expect(parsePageRange("4", 6)).toEqual({ from: 4, to: 4 });
    expect(parsePageRange("3-5", 6)).toEqual({ from: 3, to: 5 });
    expect(parsePageRange("3–5", 6)).toEqual({ from: 3, to: 5 });
    expect(parsePageRange("3 a 5", 6)).toEqual({ from: 3, to: 5 });
  });

  it("voltea un rango al revés y recorta uno que se pasa del final", () => {
    expect(parsePageRange("5-3", 6)).toEqual({ from: 3, to: 5 });
    expect(parsePageRange("5-9", 6)).toEqual({ from: 5, to: 6 });
  });

  it("no adivina: lo que no entiende o queda fuera del documento es null", () => {
    expect(parsePageRange("la de bebidas", 6)).toBeNull();
    expect(parsePageRange("9", 6)).toBeNull();
    expect(parsePageRange("0", 6)).toBeNull();
  });
});

describe("pdfPages", () => {
  it("separa por las marcas de página, y una página sin texto no viene", () => {
    const text = "[Página 1]\nUno\n\n[Página 3]\nTres";
    expect(pdfPages(text)).toEqual([
      { page: 1, text: "Uno" },
      { page: 3, text: "Tres" },
    ]);
  });
});

describe("textView", () => {
  it("un PDF por página: solo la que se pidió, con su marca", () => {
    const view = textView(MENU, "4");
    expect(view.text).toBe("[Página 4]\nPan de cazón: $145");
    expect(view.seen).toBe("4");
    expect(view.cut).toBe(false);
  });

  it("sin rango, el PDF completo si cabe", () => {
    const view = textView(MENU);
    expect(view.seen).toBe("1-6");
    expect(view.text).toContain("[Página 6]\nPostres");
    expect(view.cut).toBe(false);
  });

  it("un PDF largo sin rango se corta por páginas enteras y lo dice", () => {
    const page = "x".repeat(10_000);
    const view = textView(pdf([page, page, page, page]));
    expect(view.seen).toBe("1-2");
    expect(view.cut).toBe(true);
    expect(view.text.length).toBeLessThanOrEqual(VIEW_TEXT_CHARS);
  });

  it("una sola página más larga que el tope va cortada, y lo dice", () => {
    const view = textView(pdf(["y".repeat(VIEW_TEXT_CHARS + 500)]), "1");
    expect(view.text.length).toBe(VIEW_TEXT_CHARS);
    expect(view.cut).toBe(true);
  });

  it("un PDF guardado recortado sabe hasta dónde llegó", () => {
    // Se guardaron 2 de 10 páginas (el tope de 100k caracteres de la subida).
    const view = textView(pdf(["Uno", "Dos"], { pages: 10, truncated: true }));
    expect(view.seen).toBe("1-2");
    expect(view.lastStored).toBe(2);
    expect(view.cut).toBe(true);
  });

  it("una página que no existe, que no tiene texto o que no se guardó: missing, con su motivo", () => {
    expect(textView(MENU, "12").missing).toBe("no_existe");
    // La página 2 es una foto: el texto del PDF no la trae.
    const conFoto = pdf(["Uno", "Tres"]);
    conFoto.extractedText = "[Página 1]\nUno\n\n[Página 3]\nTres";
    conFoto.pages = 3;
    expect(textView(conFoto, "2").missing).toBe("sin_texto");
    expect(textView(pdf(["Uno", "Dos"], { pages: 10, truncated: true }), "8").missing).toBe(
      "no_guardada",
    );
    expect(textView(MENU, "4").missing).toBeNull();
  });

  it("un texto sin páginas: el inicio, hasta el tope", () => {
    const csv: ViewableAttachment = {
      kind: "text",
      pages: null,
      scanned: false,
      extractedText: "mes,piezas\n".repeat(5_000),
      truncated: false,
      tokenEstimate: 15_000,
    };
    const view = textView(csv);
    expect(view.text.length).toBe(VIEW_TEXT_CHARS);
    expect(view.seen).toBeNull();
    expect(view.cut).toBe(true);
  });
});

describe("viewCost", () => {
  it("un texto cuesta lo que se ve; una imagen y un escaneado, su estimado", () => {
    expect(viewCost(MENU, textView(MENU, "4"))).toBeLessThan(20);
    expect(
      viewCost(
        {
          kind: "image",
          pages: null,
          scanned: false,
          extractedText: null,
          truncated: false,
          tokenEstimate: 1_600,
        },
        null,
      ),
    ).toBe(1_600);
    expect(
      viewCost(
        {
          kind: "pdf",
          pages: 20,
          scanned: true,
          extractedText: null,
          truncated: false,
          tokenEstimate: 36_000,
        },
        null,
      ),
    ).toBe(36_000);
  });
});

describe("F10.11 cierre", () => {
  it("el nombre se compara como lo vio el modelo: espacios raros, corchetes y comillas", () => {
    // Una captura de macOS trae un espacio angosto antes de "a.m."
    expect(
      sameAttachmentName(
        "Captura de pantalla 2026-10-30 a las 10.15.32 a.m..png",
        "Captura de pantalla 2026-10-30 a las 10.15.32 a.m..png",
      ),
    ).toBe(true);
    expect(sameAttachmentName('"menu (final).pdf"', "menu [final].pdf")).toBe(true);
    expect(sameAttachmentName("MENU.PDF", "menu.pdf")).toBe(true);
    expect(sameAttachmentName("otro.pdf", "menu.pdf")).toBe(false);
  });

  it("la última página guardada de un PDF recortado va marcada como a medias", () => {
    const view = textView(pdf(["Uno", "Dos"], { pages: 12, truncated: true }), "2");
    expect(view.seen).toBe("2");
    expect(view.cut).toBe(true);
  });
});
