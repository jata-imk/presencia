import { describe, expect, it } from "vitest";
import { normalizar, oggDurationSeconds, wer } from "./medir.js";

describe("normalizar", () => {
  it("baja a minúsculas y quita la puntuación", () => {
    expect(normalizar("¡Hola, Mérida! ¿Qué tal?")).toEqual(["hola", "mérida", "qué", "tal"]);
  });

  it("sin acentos quita las tildes pero deja la ñ", () => {
    expect(normalizar("Año más café", { sinAcentos: true })).toEqual(["año", "mas", "cafe"]);
  });
});

describe("wer", () => {
  it("es 0 cuando son iguales salvo puntuación y mayúsculas", () => {
    expect(wer("Hazme un post de LinkedIn.", "hazme un post de linkedin")).toBe(0);
  });

  it("cuenta sustituciones, borrados e inserciones sobre la referencia", () => {
    // 1 sustitución (cuarenta → cuarentaicinco) sobre 4 palabras.
    expect(wer("el café cuesta cuarenta", "el café cuesta cuarentaicinco")).toBe(0.25);
    // 1 borrado.
    expect(wer("tres ideas para reels", "tres ideas reels")).toBe(0.25);
  });

  it("puede ignorar los acentos", () => {
    expect(wer("Progreso está cerca", "Progreso esta cerca")).toBeCloseTo(1 / 3);
    expect(wer("Progreso está cerca", "Progreso esta cerca", { sinAcentos: true })).toBe(0);
  });
});

describe("oggDurationSeconds", () => {
  function pagina(granulo: bigint, cuerpo: number[] = []): number[] {
    const h = new Uint8Array(27);
    h.set([0x4f, 0x67, 0x67, 0x53]);
    new DataView(h.buffer).setBigUint64(6, granulo, true);
    return [...h, ...cuerpo];
  }
  const opusHead = (preSkip: number) => {
    const b = new Uint8Array(19);
    b.set([..."OpusHead"].map((c) => c.charCodeAt(0)));
    new DataView(b.buffer).setUint16(10, preSkip, true);
    return [...b];
  };

  it("lee el granulo de la última página menos el pre-skip, a 48 kHz", () => {
    const data = new Uint8Array([...pagina(0n, opusHead(312)), ...pagina(48_000n * 42n + 312n)]);
    expect(oggDurationSeconds(data)).toBe(42);
  });

  it("devuelve undefined si no es Ogg Opus", () => {
    expect(oggDurationSeconds(new Uint8Array(64))).toBeUndefined();
  });
});
