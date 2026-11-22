import { describe, expect, it } from "vitest";
import {
  avisarActualizacion,
  cambioDeEngagement,
  copyDeEstado,
  fechaCorta,
  listaDeRedes,
  numero,
  rangoDeTramo,
  textoCambio,
  textoEngagement,
  textoLift,
  tramosDe,
} from "./formato.js";

const MERIDA = "America/Merida";
const AHORA = new Date("2026-11-21T18:00:00.000Z");

describe("numero", () => {
  it.each([
    [0, "0"],
    [950, "950"],
    [2140, "2,140"],
    [9999, "9,999"],
    [12480, "12.5K"],
    [48200, "48.2K"],
    [1_250_000, "1.3M"],
  ])("%d → %s", (n, esperado) => {
    expect(numero(n)).toBe(esperado);
  });
});

describe("textoEngagement", () => {
  it("con tasa es un porcentaje con un decimal", () => {
    expect(textoEngagement("tasa", 0.052)).toEqual({ numero: "5.2%", unidad: null });
  });
  it("sin alcance son interacciones por publicación", () => {
    expect(textoEngagement("interacciones", 86.4)).toEqual({
      numero: "86",
      unidad: "por publicación",
    });
  });
});

describe("textoCambio", () => {
  it("engagement con tasa: en puntos", () => {
    expect(cambioDeEngagement("tasa", 0.004)).toEqual({ texto: "+0.4 pts", direccion: "sube" });
    expect(cambioDeEngagement("tasa", -0.003)).toEqual({
      texto: "−0.3 pts",
      direccion: "baja",
    });
  });
  it("engagement sin alcance: en interacciones por publicación", () => {
    expect(cambioDeEngagement("interacciones", 9.2)).toEqual({ texto: "+9", direccion: "sube" });
  });
  it("alcance e interacciones: en porcentaje", () => {
    expect(textoCambio("pct", 12)).toEqual({ texto: "+12%", direccion: "sube" });
    expect(textoCambio("pct", -3)).toEqual({ texto: "−3%", direccion: "baja" });
  });
  it("publicaciones: en unidades", () => {
    expect(textoCambio("unidades", 4)).toEqual({ texto: "+4", direccion: "sube" });
  });
  it("lo que se redondea a cero no tiene dirección", () => {
    expect(cambioDeEngagement("tasa", 0.0002)).toEqual({ texto: "0 pts", direccion: "igual" });
    expect(textoLift(0)).toEqual({ texto: "0%", direccion: "igual" });
  });
});

describe("listaDeRedes", () => {
  it("une con «y»", () => {
    expect(listaDeRedes(["instagram"])).toBe("Instagram");
    expect(listaDeRedes(["instagram", "facebook"])).toBe("Instagram y Facebook");
  });
});

describe("tramos de la tendencia", () => {
  it("parte el periodo como el motor: 7, 5 o 9 tramos iguales que terminan ahora", () => {
    expect(tramosDe(7, AHORA)).toHaveLength(7);
    expect(tramosDe(90, AHORA)).toHaveLength(9);
    const treinta = tramosDe(30, AHORA);
    expect(treinta).toHaveLength(5);
    expect(treinta[0]?.inicio.toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(treinta[4]?.fin.toISOString()).toBe(AHORA.toISOString());
  });

  it("etiqueta con fechas cortas en la zona del creator", () => {
    const [primero, segundo] = tramosDe(30, AHORA);
    expect(fechaCorta(primero!.inicio, MERIDA)).toBe("22 oct");
    expect(rangoDeTramo(primero!, MERIDA)).toBe("22–28 oct");
    expect(rangoDeTramo(segundo!, MERIDA)).toBe("28 oct – 3 nov");
  });
});

describe("copyDeEstado", () => {
  it("cada estado dice el suyo, con su red", () => {
    expect(copyDeEstado("medida", "instagram")).toBeNull();
    expect(copyDeEstado("en_camino", "instagram")?.detalle).toBe(
      "Instagram suele tardar unas horas en reportar",
    );
    expect(copyDeEstado("no_reporta", "linkedin")?.detalle).toBe(
      "LinkedIn no comparte estadísticas de perfiles personales",
    );
    expect(copyDeEstado("sin_medicion", "linkedin")?.titulo).toBe(
      "Sin medición para esta publicación",
    );
  });
});

describe("avisarActualizacion", () => {
  const hace = (horas: number) => new Date(AHORA.getTime() - horas * 60 * 60 * 1000).toISOString();
  it("desde 6 horas", () => {
    expect(avisarActualizacion(hace(5.9), AHORA)).toBe(false);
    expect(avisarActualizacion(hace(6), AHORA)).toBe(true);
    expect(avisarActualizacion(null, AHORA)).toBe(false);
  });
});
