import { describe, expect, it } from "vitest";
import { modoDeGoals, resolveMacroRegion } from "@presencia/shared";
import {
  METAS,
  muestraCorta,
  muestrasUtiles,
  paisAGuardar,
  propuestaDePrimerPost,
  rasgoNunca,
  regionAGuardar,
  TODA_LA_REPUBLICA,
  ZONAS,
} from "./onboarding.js";

describe("regionAGuardar", () => {
  it("junta la ciudad y la zona", () => {
    expect(regionAGuardar("Tekax", "Sureste")).toBe("Tekax, Sureste");
  });

  it("si la ciudad está en el catálogo, la zona no la pisa", () => {
    expect(resolveMacroRegion("MX", regionAGuardar("CDMX", "Centro") ?? null)).toBe("cdmx");
    expect(resolveMacroRegion("MX", regionAGuardar("León", "Centro") ?? null)).toBe("bajio");
    expect(resolveMacroRegion("MX", regionAGuardar("Tekax", "Sureste") ?? null)).toBe("sureste");
  });

  it("«Toda la república» no se guarda como región", () => {
    expect(regionAGuardar("", TODA_LA_REPUBLICA)).toBeUndefined();
    expect(regionAGuardar("Puebla", TODA_LA_REPUBLICA)).toBe("Puebla");
  });

  // La razón de guardar las dos: un pueblo que el catálogo no reconoce igual
  // cae en su macro-región por la zona.
  it("cada zona del diseño la reconoce resolveMacroRegion", () => {
    for (const zona of ZONAS) {
      expect(resolveMacroRegion("MX", regionAGuardar("Mi pueblo", zona) ?? null)).not.toBe(
        "nacional",
      );
    }
  });
});

describe("paisAGuardar", () => {
  it("México se guarda como MX, como siempre", () => {
    expect(paisAGuardar("México")).toBe("MX");
    expect(paisAGuardar("Colombia")).toBe("Colombia");
  });
});

describe("muestras", () => {
  it("manda solo las que tienen texto", () => {
    expect(muestrasUtiles(["  hola mundo de prueba larga  ", "", "   "])).toEqual([
      "hola mundo de prueba larga",
    ]);
  });

  it("avisa cuál se quedó corta, sin contar las vacías", () => {
    expect(muestraCorta(["", "un post de veinte caracteres o más", "corto"])).toBe(2);
    expect(muestraCorta(["", "un post de veinte caracteres o más"])).toBeNull();
  });
});

describe("rasgoNunca", () => {
  it("convierte lo que nunca diría en un rasgo «Nunca:»", () => {
    expect(rasgoNunca(" «¡Hola, familia!» ")).toBe("Nunca: «¡Hola, familia!»");
    expect(rasgoNunca("   ")).toBeNull();
  });

  it("no pasa del tope de un rasgo", () => {
    expect(rasgoNunca("x".repeat(300))?.length).toBe(140);
  });
});

describe("propuestaDePrimerPost", () => {
  it("lleva el borrador aprobado y la red conectada", () => {
    const texto = propuestaDePrimerPost("Mi post", "tiktok");
    expect(texto).toContain("Quiero publicar esto en TikTok");
    expect(texto).toContain("Mi post");
  });

  it("sin borrador pide uno, y sin red cae en Instagram", () => {
    expect(propuestaDePrimerPost(null, null)).toBe(
      "Quiero crear mi primera publicación para Instagram. ¿Qué me recomiendas?",
    );
  });
});

describe("METAS", () => {
  it("«Crecer audiencia» y «Monetizar» derivan el modo crecer", () => {
    const etiqueta = (id: string) => METAS.find((m) => m.id === id)?.label ?? "";
    expect(modoDeGoals([etiqueta("crecer")])).toBe("crecer");
    expect(modoDeGoals([etiqueta("monetizar")])).toBe("crecer");
    expect(modoDeGoals([etiqueta("tiempo")])).toBe("mantener");
  });
});
