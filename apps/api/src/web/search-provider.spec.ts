import { afterEach, describe, expect, it, vi } from "vitest";
import { BraveSearchProvider, FakeSearchProvider, plainSnippet } from "./search-provider.js";

// F10.10: el adapter de Brave contra un fetch de mentira: qué pide y qué
// entrega. La calidad del buscador la midió el bake-off.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BraveSearchProvider", () => {
  it("pide México y español con fragmentos extra, y entrega texto plano", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      void url;
      void init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Precio del <strong>café</strong> en Mérida",
                  url: "https://www.yucatan.com.mx/merida/cafe",
                  description: "Un americano ronda entre 45 y 60 pesos &amp; sube.",
                  extra_snippets: ["El latte <strong>de especialidad</strong> pasa de 70."],
                  page_age: "2026-10-20T10:00:00",
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await new BraveSearchProvider("llave").search("precio del café en Mérida");

    const [url, init] = fetchMock.mock.calls[0]!;
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("precio del café en Mérida");
    expect(params.get("country")).toBe("MX");
    expect(params.get("search_lang")).toBe("es");
    expect(params.get("extra_snippets")).toBe("true");
    expect((init.headers as Record<string, string>)["X-Subscription-Token"]).toBe("llave");
    expect(results).toEqual([
      {
        titulo: "Precio del café en Mérida",
        url: "https://www.yucatan.com.mx/merida/cafe",
        dominio: "yucatan.com.mx",
        fragmento:
          "Un americano ronda entre 45 y 60 pesos & sube. El latte de especialidad pasa de 70.",
        fecha: "2026-10-20T10:00:00",
      },
    ]);
  });

  it("una respuesta de error lanza (la tool la vuelve no_disponible)", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("cuota", { status: 429 })));
    await expect(new BraveSearchProvider("llave").search("x")).rejects.toThrow("429");
  });

  it("sin resultados es una lista vacía, no un error", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 200 })));
    expect(await new BraveSearchProvider("llave").search("x")).toEqual([]);
  });
});

describe("FakeSearchProvider", () => {
  it("dice que su resultado es de mentira", async () => {
    const [r] = await new FakeSearchProvider().search("algo");
    expect(r?.fragmento).toContain("No es información real");
  });
});

describe("plainSnippet", () => {
  it("quita etiquetas, decodifica entidades y recorta", () => {
    expect(plainSnippet("<b>Hola</b>&nbsp;&quot;Mérida&quot;", 8)).toBe('Hola "Mé…');
  });
});

describe("BraveSearchProvider — resultados raros", () => {
  const conResultados = (results: unknown[]) =>
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify({ web: { results } }), { status: 200 })),
    );

  it("tira los que no son http(s): un link javascript: no llega al modelo ni a la UI", async () => {
    conResultados([
      { title: "Trampa", url: "javascript:alert(1)", description: "x" },
      { title: "Bien", url: "https://www.yucatan.com.mx/nota", description: "y" },
    ]);
    const results = await new BraveSearchProvider("llave").search("x");
    expect(results.map((r) => r.titulo)).toEqual(["Bien"]);
  });

  it("el dominio es el host aunque no sea uno común, nunca la URL entera", async () => {
    conResultados([{ title: "Ruso", url: "https://www.пример.рф/ruta?q=1", description: "x" }]);
    const [r] = await new BraveSearchProvider("llave").search("x");
    expect(r?.dominio).toBe("xn--e1afmkfd.xn--p1ai");
  });
});

describe("plainSnippet — entidades numéricas", () => {
  it("decodifica &#233;, &#x27;, &apos; y &hellip;", () => {
    expect(plainSnippet("caf&#233; de &#x27;Mérida&apos;&hellip;")).toBe("café de 'Mérida'…");
  });

  it("una entidad que no conoce se queda tal cual", () => {
    expect(plainSnippet("a &foo; b")).toBe("a &foo; b");
  });
});
