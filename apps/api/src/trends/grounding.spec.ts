import { describe, expect, it } from "vitest";
import { ensamblarTendencias, extraerFuentes, type TendenciaCruda } from "./grounding.js";

// Lo que se prueba acá es la invariante del módulo: no puede existir una
// tendencia sin una página real detrás. Es la regla que el doc de producto
// llama "la regla de oro", y la única forma de que no dependa de que el
// modelo obedezca es que el código no le deje escribir la URL.

function cruda(campos: Partial<TendenciaCruda> = {}): TendenciaCruda {
  return {
    topic: "Carruseles antes y después de rediseños",
    signal: "rising",
    network: "instagram",
    format: "carrusel",
    blurb: "El formato lado a lado está moviéndose fuerte en cuentas de diseño.",
    sourceIndex: 0,
    ...campos,
  };
}

const FUENTES = [
  { uri: "https://ejemplo.mx/tendencias-diseno", title: "Tendencias de diseño MX" },
  { uri: "https://ejemplo.mx/reels", title: "Reels que funcionan" },
];

describe("extraerFuentes", () => {
  it("lee las páginas que la búsqueda visitó", () => {
    const metadata = {
      google: {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://a.mx/x", title: "A" } },
            { web: { uri: "https://b.mx/y", title: "B" } },
          ],
        },
      },
    };
    expect(extraerFuentes(metadata)).toEqual([
      { uri: "https://a.mx/x", title: "A" },
      { uri: "https://b.mx/y", title: "B" },
    ]);
  });

  it("usa la URL como título cuando la página no trae uno", () => {
    const metadata = {
      google: { groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.mx/x" } }] } },
    };
    expect(extraerFuentes(metadata)).toEqual([{ uri: "https://a.mx/x", title: "https://a.mx/x" }]);
  });

  it("descarta lo que no tiene URL en vez de inventar el campo", () => {
    const metadata = {
      google: {
        groundingMetadata: {
          groundingChunks: [{ web: { title: "Sin liga" } }, { retrievedContext: {} }, null],
        },
      },
    };
    expect(extraerFuentes(metadata)).toEqual([]);
  });

  it("no truena si el proveedor cambia la forma del metadata", () => {
    // Es la forma de un tercero, no un contrato nuestro. Quedarse sin fuentes
    // hace que el refresco no escriba nada, que es el resultado correcto.
    expect(extraerFuentes(undefined)).toEqual([]);
    expect(extraerFuentes({})).toEqual([]);
    expect(extraerFuentes({ google: { groundingMetadata: { groundingChunks: "nope" } } })).toEqual(
      [],
    );
  });
});

describe("ensamblarTendencias", () => {
  it("la URL sale de la fuente, no del modelo", () => {
    const items = ensamblarTendencias([cruda({ sourceIndex: 1 })], FUENTES);
    expect(items).toHaveLength(1);
    expect(items[0]?.sourceUrl).toBe("https://ejemplo.mx/reels");
    expect(items[0]?.sourceTitle).toBe("Reels que funcionan");
  });

  it("un índice que no apunta a nada no produce un item sin fuente", () => {
    // Este es el caso que justifica el módulo entero: el modelo alucinó una
    // referencia. El resultado correcto es una tendencia menos, no una
    // tendencia con procedencia inventada.
    expect(ensamblarTendencias([cruda({ sourceIndex: 7 })], FUENTES)).toEqual([]);
    expect(ensamblarTendencias([cruda({ sourceIndex: -1 })], FUENTES)).toEqual([]);
  });

  it("sin fuentes no hay tendencias, por buenas que se vean", () => {
    expect(ensamblarTendencias([cruda(), cruda({ topic: "Otra cosa" })], [])).toEqual([]);
  });

  it("descarta el item que no pasa el schema en vez de dejarlo a medias", () => {
    expect(ensamblarTendencias([cruda({ signal: "explotando" })], FUENTES)).toEqual([]);
    expect(ensamblarTendencias([cruda({ network: "myspace" })], FUENTES)).toEqual([]);
    expect(ensamblarTendencias([cruda({ blurb: "   " })], FUENTES)).toEqual([]);
  });

  it("el mismo tema dos veces es una sola tendencia", () => {
    const items = ensamblarTendencias(
      [
        cruda({ sourceIndex: 0 }),
        cruda({ topic: "  CARRUSELES ANTES Y DESPUÉS DE REDISEÑOS  ", sourceIndex: 1 }),
      ],
      FUENTES,
    );
    expect(items).toHaveLength(1);
  });

  it("no hay forma de que un item traiga un porcentaje", () => {
    // Ritmo §8 prohíbe el "+%" en tendencias: no hay fuente real de la que
    // salga. El schema no tiene campo numérico, así que ni siquiera se puede
    // colar "provisionalmente".
    const items = ensamblarTendencias([cruda()], FUENTES);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual([
      "blurb",
      "format",
      "network",
      "signal",
      "sourceTitle",
      "sourceUrl",
      "topic",
    ]);
  });
});
