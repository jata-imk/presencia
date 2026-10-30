import { describe, expect, it } from "vitest";
import { extractHtmlOffThread } from "./extract-html-thread.js";

// F10.10: la extracción corre en un worker, con tope de tiempo.

const article = `<html><head><title>Nota</title></head><body><article>${"<p>El precio del café en Mérida subió este año en las cafeterías del Centro.</p>".repeat(20)}</article></body></html>`;

describe("extractHtmlOffThread", () => {
  it("devuelve lo mismo que la extracción, desde el worker", async () => {
    const page = await extractHtmlOffThread(article, "https://x.mx/nota", false);
    expect(page).toMatchObject({ ok: true, title: "Nota" });
  });

  it("una página que no termina a tiempo se corta, sin colgar el turno", async () => {
    // Mucho markup anidado: segundos en el parser (revisión de cierre de F10.10).
    const heavy = `<html><body>${"<div><span>x</span><a href='/a'>l</a><div><img src='a.png'></div></div>".repeat(20_000)}</body></html>`;
    const page = await extractHtmlOffThread(heavy, "https://x.mx/", false, { timeoutMs: 200 });
    expect(page).toEqual({ ok: false, detail: "la página es demasiado pesada para leerla" });
  });

  it("Detener mata el worker en ese momento, sin esperar el tope", async () => {
    const heavy = `<html><body>${"<div><span>x</span><a href='/a'>l</a><div><img src='a.png'></div></div>".repeat(20_000)}</body></html>`;
    const controller = new AbortController();
    const started = Date.now();
    const reading = extractHtmlOffThread(heavy, "https://x.mx/", false, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error("detenido")), 300);
    await expect(reading).rejects.toThrow("detenido");
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
