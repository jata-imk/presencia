import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ATTACHMENT_TEXT_MAX_CHARS } from "@presencia/shared";
import {
  IMAGE_TOKEN_ESTIMATE,
  PDF_PAGE_TOKEN_ESTIMATE,
  RejectedAttachmentError,
  UnsupportedAttachmentError,
  cleanFilename,
  processAttachment,
} from "./attachment-content.js";

// F10.9: qué es un adjunto y qué se guarda de él. Sin base ni storage: solo
// los bytes de entrada y lo que sale.

/**
 * Un PDF mínimo hecho a mano, una página por texto ("" = página sin texto,
 * como la de un escaneo). Con su tabla xref bien calculada: pdf.js la
 * repararía, pero así el test no depende de eso.
 */
export function pdfWithPages(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const [i, text] of pages.entries()) {
    const content = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageIds[i]! + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const LARGO = "Menu de temporada: marquesitas de queso de bola, de cajeta y de Nutella. ";

describe("processAttachment", () => {
  it("una foto grande se guarda a 2048 sin EXIF, con su variante de 1568 para el modelo", async () => {
    const foto = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 80, b: 40 } },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: "GPS 20.97,-89.62" } })
      .toBuffer();

    const out = await processAttachment(new Uint8Array(foto), "IMG_0001.HEIC.jpg");

    expect(out).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 2048,
      height: 1536,
      tokenEstimate: IMAGE_TOKEN_ESTIMATE,
    });
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect(await sharp(out.modelData!).metadata()).toMatchObject({ width: 1568, height: 1176 });
  });

  it("una captura chica se queda en PNG, sin variante (ya cabe)", async () => {
    const captura = await sharp({
      create: { width: 800, height: 600, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const out = await processAttachment(new Uint8Array(captura), "");
    expect(out).toMatchObject({ kind: "image", mimeType: "image/png", width: 800 });
    expect(out.modelData).toBeNull();
  });

  it("un GIF se queda con su primer cuadro, en PNG", async () => {
    const gif = await sharp({
      create: { width: 30, height: 30, channels: 3, background: "#00ff00" },
    })
      .gif()
      .toBuffer();
    const out = await processAttachment(new Uint8Array(gif), "baile.gif");
    expect(out).toMatchObject({ kind: "image", mimeType: "image/png", extension: "png" });
  });

  it("un .md se lee como texto, sin el BOM", async () => {
    const md = new TextEncoder().encode("\uFEFF# Menú\n\n- Marquesita de queso");
    const out = await processAttachment(md, "menu.md");
    expect(out).toMatchObject({
      kind: "text",
      mimeType: "text/markdown",
      extension: "md",
      extractedText: "# Menú\n\n- Marquesita de queso",
      truncated: false,
    });
    expect(out.tokenEstimate).toBeGreaterThan(0);
  });

  it("un texto demasiado largo se recorta, con aviso", async () => {
    const csv = new TextEncoder().encode("producto,precio\n".repeat(10_000));
    const out = await processAttachment(csv, "precios.csv");
    expect(out.truncated).toBe(true);
    expect(out.extractedText).toHaveLength(ATTACHMENT_TEXT_MAX_CHARS);
    expect(out.mimeType).toBe("text/csv");
  });

  it("un .txt que no es UTF-8 se rechaza con el motivo", async () => {
    // "Menú" en Latin-1: la ú es 0xFA, que en UTF-8 es inválida sola.
    const latin1 = new Uint8Array([0x4d, 0x65, 0x6e, 0xfa]);
    await expect(processAttachment(latin1, "menu.txt")).rejects.toThrow(RejectedAttachmentError);
  });

  it("un binario o un tipo que no se adjunta no pasa", async () => {
    await expect(
      processAttachment(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]), "documento.docx"),
    ).rejects.toThrow(UnsupportedAttachmentError);
    await expect(processAttachment(new Uint8Array([0x61, 0, 0x62]), "raro.txt")).rejects.toThrow(
      UnsupportedAttachmentError,
    );
  });

  it("un PDF con texto se lee como texto, con sus páginas marcadas", async () => {
    const pdf = pdfWithPages([
      LARGO,
      "Horario de martes a domingo, de 6 a 11 de la noche, en el centro.",
    ]);
    const out = await processAttachment(pdf, "menu.pdf");
    expect(out).toMatchObject({
      kind: "pdf",
      mimeType: "application/pdf",
      pages: 2,
      scanned: false,
    });
    expect(out.extractedText).toContain("[Página 1]");
    expect(out.extractedText).toContain("[Página 2]");
    expect(out.extractedText).toContain("martes a domingo");
  });

  it("un PDF sin texto es escaneado: viaja nativo y se estima por página", async () => {
    const out = await processAttachment(pdfWithPages(["", "", ""]), "escaneo.pdf");
    expect(out).toMatchObject({
      kind: "pdf",
      pages: 3,
      scanned: true,
      extractedText: null,
      tokenEstimate: 3 * PDF_PAGE_TOKEN_ESTIMATE,
    });
  });

  it("una portada sin texto en un menú de texto no lo vuelve escaneado", async () => {
    const pages = ["", ...Array.from({ length: 9 }, () => LARGO)];
    const out = await processAttachment(pdfWithPages(pages), "menu.pdf");
    expect(out).toMatchObject({ scanned: false, pages: 10 });
    expect(out.extractedText).not.toContain("[Página 1]");
    expect(out.extractedText).toContain("[Página 2]");
  });

  it("un PDF con buena parte escaneada viaja nativo, aunque traiga algo de texto", async () => {
    const out = await processAttachment(pdfWithPages([LARGO, LARGO, "", "", ""]), "mixto.pdf");
    expect(out).toMatchObject({ scanned: true, pages: 5, extractedText: null });
  });

  it("un PDF escaneado de más de 20 páginas se rechaza: súbelo en partes", async () => {
    const pages = Array.from({ length: 21 }, () => "");
    await expect(processAttachment(pdfWithPages(pages), "contrato.pdf")).rejects.toThrow(
      /21 páginas; el límite es 20/,
    );
  });

  it("un PDF dañado se rechaza con un motivo que se entiende", async () => {
    const roto = new Uint8Array(Buffer.from("%PDF-1.4\nesto no es un pdf", "latin1"));
    await expect(processAttachment(roto, "roto.pdf")).rejects.toThrow(/No pudimos leer este PDF/);
  });
});

describe("cleanFilename", () => {
  it("sin carpetas ni caracteres de control, y con nombre si no trae", () => {
    expect(cleanFilename("C:\\fakepath\\menú.pdf", "x")).toBe("menú.pdf");
    expect(cleanFilename("a\u0000b.txt", "x")).toBe("ab.txt");
    expect(cleanFilename(undefined, "captura.png")).toBe("captura.png");
  });
});
