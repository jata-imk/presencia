import { describe, expect, it } from "vitest";
import {
  asVerticalId,
  MACRO_REGIONS,
  resolveMacroRegion,
  resolveVertical,
  verticalDeNicho,
  VERTICALS,
} from "@presencia/shared";

// Vive en apps/api y no en packages/shared porque shared no tiene runner de
// tests propio; es el mismo criterio con el que brand-voice.service.spec.ts
// prueba updateBrandVoiceBodySchema, que también es un contrato de shared.
//
// Lo que estas pruebas cuidan no es la taxonomía —esa se ajusta con el uso—
// sino la propiedad de la que cuelga la caché: la misma entrada tiene que dar
// siempre la misma llave. Un mapeo que varíe partiría la caché en dos sin que
// nada falle.

describe("verticalDeNicho", () => {
  it("reconoce el nicho escrito con acentos", () => {
    // El nicho lo escribe una persona: "repostería" y "reposteria" son la
    // misma cosa y no pueden caer en llaves distintas.
    expect(verticalDeNicho(["repostería"])).toBe("food");
    expect(verticalDeNicho(["reposteria"])).toBe("food");
  });

  it("encuentra la palabra dentro de una frase", () => {
    expect(verticalDeNicho(["marketing digital para pymes"])).toBe("marketing");
  });

  it("devuelve null cuando nada del catálogo aplica", () => {
    // Que no haya match es información: el llamador decide si cae a `general`.
    expect(verticalDeNicho(["apicultura melipona"])).toBeNull();
    expect(verticalDeNicho([])).toBeNull();
    expect(verticalDeNicho(["   "])).toBeNull();
  });

  it("no confunde una palabra con la subcadena de otra", () => {
    // El bug que motivó cambiar el match a palabra completa: `ia` vivía dentro
    // de "familia" y `ui` dentro de "cuidado", así que maternidad caía en
    // tecnología y skincare en diseño. Ninguna de las dos rompía nada visible:
    // solo mandaban al usuario a una caché de tendencias que no era la suya.
    expect(verticalDeNicho(["familia"])).toBe("parenting");
    expect(verticalDeNicho(["cuidado de la piel", "skincare"])).toBe("beauty");
    // Y "sur" no debe encontrarse dentro de cualquier palabra que lo contenga.
    expect(resolveMacroRegion("MX", "Surtidora de abarrotes")).toBe("nacional");
  });

  it("las claves de varias palabras se buscan como frase", () => {
    expect(verticalDeNicho(["bienes raices en Cancún"])).toBe("real_estate");
    // "bienes" solo, sin "raices", no alcanza.
    expect(verticalDeNicho(["bienes de consumo"])).toBeNull();
  });

  it("separa por guiones, comas y emojis, no solo por espacios", () => {
    expect(verticalDeNicho(["fitness/nutricion"])).toBe("fitness");
    expect(verticalDeNicho(["🔥 marketing"])).toBe("marketing");
  });

  it("gana la vertical con más aciertos, no la primera que aparece", () => {
    // "diseño" e "ia" son anclas de dos verticales distintas; con dos
    // términos de diseño contra uno de tech, gana diseño.
    expect(verticalDeNicho(["diseño ux", "branding", "ia"])).toBe("design");
  });

  it("el mismo nicho da siempre la misma vertical", () => {
    // La propiedad que importa: de esta llave cuelga una fila compartida.
    const nicho = ["fitness", "nutricion"];
    const primera = verticalDeNicho(nicho);
    for (let i = 0; i < 20; i++) expect(verticalDeNicho(nicho)).toBe(primera);
    // Y el orden en que el usuario escribió sus tags tampoco la cambia.
    expect(verticalDeNicho([...nicho].reverse())).toBe(primera);
  });
});

describe("resolveVertical", () => {
  it("la elección del usuario gana sobre la derivación", () => {
    expect(resolveVertical("arts", ["fitness"])).toBe("arts");
  });

  it("sin elección, deriva del nicho", () => {
    expect(resolveVertical(null, ["gimnasio en Mérida"])).toBe("fitness");
  });

  it("sin elección y sin match, cae a general en vez de dejar a nadie sin tendencias", () => {
    expect(resolveVertical(null, ["apicultura melipona"])).toBe("general");
  });
});

describe("resolveMacroRegion", () => {
  it("mapea el beachhead al sureste", () => {
    expect(resolveMacroRegion("MX", "Yucatán")).toBe("sureste");
    expect(resolveMacroRegion("MX", "Mérida, Yucatán")).toBe("sureste");
  });

  it("fuera de México siempre es nacional", () => {
    // Las macro-regiones de abajo son mexicanas: aplicarlas a Colombia daría
    // una llave con cara de válida y sin ningún significado.
    expect(resolveMacroRegion("CO", "Antioquia")).toBe("nacional");
  });

  it("sin región es nacional, no un error", () => {
    expect(resolveMacroRegion("MX", null)).toBe("nacional");
    expect(resolveMacroRegion("MX", "   ")).toBe("nacional");
  });

  it("una región que no reconoce cae a nacional", () => {
    expect(resolveMacroRegion("MX", "Marte")).toBe("nacional");
  });
});

describe("asVerticalId", () => {
  it("una vertical retirada vuelve como null, no como llave fantasma", () => {
    expect(asVerticalId("fitness")).toBe("fitness");
    expect(asVerticalId("nicho_que_ya_no_existe")).toBeNull();
    expect(asVerticalId(null)).toBeNull();
  });
});

describe("catálogo", () => {
  it("no tiene ids repetidos", () => {
    // Un id duplicado haría que dos filas de caché compitieran por la misma
    // llave y el ganador dependiera del orden de inserción.
    const ids = VERTICALS.map((vertical) => vertical.id);
    expect(new Set(ids).size).toBe(ids.length);
    const regiones = MACRO_REGIONS.map((region) => region.id);
    expect(new Set(regiones).size).toBe(regiones.length);
  });

  it("las palabras clave ya vienen normalizadas", () => {
    // Se comparan contra texto normalizado: una keyword con acento o mayúscula
    // no haría match nunca, y el fallo sería silencioso.
    for (const vertical of VERTICALS) {
      for (const palabra of vertical.keywords) {
        expect(palabra).toBe(palabra.toLowerCase());
        expect(palabra.normalize("NFD")).toBe(palabra);
      }
    }
    for (const region of MACRO_REGIONS) {
      for (const palabra of region.keywords) {
        expect(palabra).toBe(palabra.toLowerCase());
        expect(palabra.normalize("NFD")).toBe(palabra);
      }
    }
  });
});
