import { describe, expect, it } from "vitest";
import type { ChatUIMessage } from "./chat-types.js";
import { displayDate, webSources } from "./web-sources.js";

// F10.10: qué páginas son fuente de una respuesta.

const result = (n: number) => ({
  titulo: `Resultado ${String(n)}`,
  url: `https://medio${String(n)}.mx/nota`,
  dominio: `medio${String(n)}.mx`,
  fragmento: `Fragmento ${String(n)}`,
  fecha: n === 1 ? "hace 2 días" : null,
});

const message = (text: string, parts: unknown[]) =>
  ({ id: "a", role: "assistant", parts: [...parts, { type: "text", text }] }) as ChatUIMessage;

const searchPart = {
  type: "tool-buscar_en_web",
  toolCallId: "s",
  state: "output-available",
  input: { consulta: "café" },
  output: {
    searchId: "s",
    consulta: "café",
    estado: "ok",
    resultados: [1, 2, 3, 4, 5].map(result),
  },
};

const readPart = (url: string, extra: Record<string, unknown> = {}) => ({
  type: "tool-leer_enlace",
  toolCallId: `r-${url}`,
  state: "output-available",
  input: { url },
  output: {
    readId: "r",
    url,
    urlFinal: url,
    titulo: "Página leída",
    dominio: new URL(url).hostname,
    estado: "ok",
    truncado: false,
    soloDescripcion: false,
    ...extra,
  },
});

describe("webSources", () => {
  it("las leídas y los resultados que la respuesta cita, sin repetir", () => {
    const sources = webSources(
      message("Según [Medio 1](https://medio1.mx/nota) y [la otra](https://medio1.mx/nota#x)…", [
        searchPart,
        readPart("https://medio3.mx/nota"),
      ]),
    );
    expect(sources.map((s) => s.dominio)).toEqual(["medio3.mx", "medio1.mx"]);
  });

  it("una leída que vino de la búsqueda conserva su fecha y su fragmento", () => {
    const [s] = webSources(message("Listo.", [searchPart, readPart("https://medio1.mx/nota")]));
    expect(s).toMatchObject({
      titulo: "Página leída",
      fecha: "hace 2 días",
      fragmento: "Fragmento 1",
    });
  });

  it("cuenta como cita un link con paréntesis en la URL y una URL suelta", () => {
    const wiki = {
      ...searchPart,
      output: {
        ...searchPart.output,
        resultados: [
          ...searchPart.output.resultados,
          {
            ...result(6),
            url: "https://es.wikipedia.org/wiki/Mérida_(Yucatán)",
            dominio: "es.wikipedia.org",
          },
        ],
      },
    };
    const sources = webSources(
      message(
        "Ver [Wikipedia](https://es.wikipedia.org/wiki/Mérida_(Yucatán)) y https://medio2.mx/nota.",
        [wiki, readPart("https://medio3.mx/nota")],
      ),
    );
    expect(sources.map((s) => s.dominio)).toEqual(["medio3.mx", "medio2.mx", "es.wikipedia.org"]);
  });

  it("si se buscó y no se leyó ni se citó nada, se listan los resultados", () => {
    expect(webSources(message("Encontré esto.", [searchPart]))).toHaveLength(5);
  });

  it("lo que no se pudo leer no es fuente; lo leído a medias sí, con su marca", () => {
    const sources = webSources(
      message("…", [
        readPart("https://www.instagram.com/p/x", { estado: "requiere_sesion" }),
        readPart("https://inegi.org.mx/x", { truncado: true }),
        readPart("https://gob.mx/y", { soloDescripcion: true }),
      ]),
    );
    expect(sources.map((s) => [s.dominio, s.marca])).toEqual([
      ["inegi.org.mx", "parcial"],
      ["gob.mx", "descripcion"],
    ]);
  });

  it("sin herramientas web no hay fuentes", () => {
    expect(webSources(message("Hola.", []))).toEqual([]);
  });
});

describe("displayDate", () => {
  it("la fecha ISO del buscador se lee como día, sin la hora", () => {
    expect(displayDate("2026-06-12T14:13:00")).toBe("12 jun 2026");
    expect(displayDate("2026-10-20")).toBe("20 oct 2026");
  });

  it("lo que ya viene escrito pasa tal cual", () => {
    expect(displayDate("hace 2 días")).toBe("hace 2 días");
    expect(displayDate(null)).toBeNull();
  });
});
