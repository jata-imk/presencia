import { describe, expect, it } from "vitest";
import { pdfWithPages } from "../test-support/pdf.js";
import { extractPage, WEB_READ_MAX_CHARS } from "./extract.js";

// F10.10: de los bytes de una página al texto que lee el modelo.

const PARRAFO =
  "La marquesita nació en Mérida como un postre de carrito: barquillo crujiente, " +
  "queso de bola rallado y cajeta, vendida por las tardes en los parques del centro.";

const NOTA = `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<title>La marquesita cumple 80 años | Diario</title>
<meta property="og:title" content="La marquesita cumple 80 años">
<meta property="og:site_name" content="Diario de Yucatán">
<meta property="og:description" content="Un repaso por la historia del postre yucateco.">
</head><body>
<nav><a href="/">Inicio</a> <a href="/deportes">Deportes</a> <a href="/clima">Clima</a></nav>
<article>
<h1>La marquesita cumple 80 años</h1>
<p>${PARRAFO}</p>
<p>${PARRAFO} Hoy hay versiones de Nutella, de plátano y hasta de mermelada.</p>
<p>${PARRAFO} Los vendedores del parque de Santa Lucía dicen que el queso de bola manda.</p>
</article>
<footer>© Todos los derechos reservados. Aviso de privacidad. Suscríbete.</footer>
</body></html>`;

const bytes = (s: string, encoding: BufferEncoding = "utf8") =>
  new Uint8Array(Buffer.from(s, encoding));
const url = "https://www.yucatan.com.mx/merida/la-marquesita";

describe("extractPage", () => {
  it("saca el cuerpo de una nota con título, sitio y párrafos, sin menú ni pie", async () => {
    const out = await extractPage({
      kind: "html",
      body: bytes(NOTA),
      charset: "utf-8",
      url,
      truncated: false,
    });
    expect(out).toMatchObject({
      ok: true,
      title: "La marquesita cumple 80 años",
      siteName: "Diario de Yucatán",
      truncated: false,
      onlyDescription: false,
    });
    if (!out.ok) return;
    expect(out.text).toContain("queso de bola manda");
    expect(out.text).toMatch(/cajeta.*\n\n.*Nutella/s);
    expect(out.text).not.toContain("Deportes");
    expect(out.text).not.toContain("Aviso de privacidad");
  });

  it("una página armada con JavaScript, sin descripción, es ilegible", async () => {
    const spa = `<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(
      await extractPage({ kind: "html", body: bytes(spa), charset: null, url, truncated: false }),
    ).toMatchObject({ ok: false });
  });

  it("si solo hay la descripción og:, la usa y lo dice", async () => {
    const descripcion =
      "Café de especialidad en el centro de Mérida, con granos de Chiapas y Veracruz tostados aquí.";
    const spa = `<html><head><title>Café Tal</title><meta property="og:description" content="${descripcion}"></head><body><div id="root"></div></body></html>`;
    const out = await extractPage({
      kind: "html",
      body: bytes(spa),
      charset: null,
      url,
      truncated: false,
    });
    expect(out).toMatchObject({ ok: true, onlyDescription: true, text: descripcion });
  });

  it("lee un sitio viejo en ISO-8859-1 por su <meta charset>", async () => {
    const viejo = NOTA.replace(
      '<meta charset="utf-8">',
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">',
    );
    const out = await extractPage({
      kind: "html",
      body: bytes(viejo, "latin1"),
      charset: null,
      url,
      truncated: false,
    });
    expect(out.ok && out.text).toContain("Mérida");
  });

  it("texto plano pasa tal cual, normalizado", async () => {
    const out = await extractPage({
      kind: "text",
      body: bytes("Hola   Mérida\r\n\r\n\r\n\r\nadiós"),
      charset: null,
      url,
      truncated: false,
    });
    expect(out).toMatchObject({ ok: true, text: "Hola Mérida\n\nadiós", title: null });
  });

  it("guarda solo el inicio de una página enorme y lo marca", async () => {
    const out = await extractPage({
      kind: "text",
      body: bytes("palabra ".repeat(WEB_READ_MAX_CHARS)),
      charset: null,
      url,
      truncated: false,
    });
    expect(out).toMatchObject({ ok: true, truncated: true });
    if (out.ok) expect(out.text.length).toBe(WEB_READ_MAX_CHARS + 1);
  });

  it("una descarga cortada se marca como truncada aunque quepa", async () => {
    const out = await extractPage({
      kind: "html",
      body: bytes(NOTA),
      charset: "utf-8",
      url,
      truncated: true,
    });
    expect(out).toMatchObject({ ok: true, truncated: true });
  });

  it("lee un PDF con texto", async () => {
    const out = await extractPage({
      kind: "pdf",
      // Largo a propósito: una página con muy poco texto cuenta como escaneada.
      body: pdfWithPages([
        "Programa del Hanal Pixan 2026 en Merida: altares en la Plaza Grande, paseo de las animas y comida tradicional.",
      ]),
      charset: null,
      url,
      truncated: false,
    });
    expect(out.ok && out.text).toContain("Hanal Pixan");
  });

  it("un PDF escaneado no tiene texto: ilegible", async () => {
    const out = await extractPage({
      kind: "pdf",
      body: pdfWithPages([""]),
      charset: null,
      url,
      truncated: false,
    });
    expect(out).toMatchObject({ ok: false });
  });
});
