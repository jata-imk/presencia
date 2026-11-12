import { describe, expect, it } from "vitest";
import {
  decisionesDeVoz,
  fueEditada,
  proponerAjustesDeVoz,
  rasgoCubreRegla,
  textoDePublicacion,
  type EdicionDePublicacion,
} from "@presencia/shared";

// Las reglas de «Aprender de mis ediciones» (packages/shared/src/voz-viva.ts).
// Viven en shared, pero shared no tiene vitest: se prueban aquí, como
// verticals.spec.ts.

let reloj = Date.parse("2026-11-01T12:00:00Z");
/** Ediciones en orden: cada una una hora después de la anterior. */
function edicion(original: string, final: string, hashtags: [string[], string[]] = [[], []]) {
  reloj += 3_600_000;
  return {
    original: { texto: original, hashtags: hashtags[0] },
    final: { texto: final, hashtags: hashtags[1] },
    momento: new Date(reloj).toISOString(),
  } satisfies EdicionDePublicacion;
}

const SIN_NADA = { rasgos: [], decisiones: {} };

const conEmojis = () =>
  edicion(
    "Lunes de productividad 🚀🔥\nTe comparto mi sistema.",
    "Lunes de productividad\nTe comparto mi sistema.",
  );
const intacta = () => edicion("Hoy abrimos temprano ☕", "Hoy abrimos temprano ☕");

describe("proponerAjustesDeVoz", () => {
  it("propone «Casi sin emojis» con 4 de 6 y lo cuenta en el mensaje", () => {
    const ediciones = [conEmojis(), intacta(), conEmojis(), conEmojis(), intacta(), conEmojis()];
    const [propuesta, ...otras] = proponerAjustesDeVoz(ediciones, SIN_NADA);
    expect(otras).toHaveLength(0);
    expect(propuesta).toMatchObject({
      id: "emojis",
      origen: "regla",
      rasgo: "Casi sin emojis",
      mensaje: "Quitaste emojis en 4 de tus últimas 6 publicaciones.",
    });
    // La evidencia es la línea donde estaban, no el post completo.
    expect(propuesta?.evidencia[0]).toEqual({
      antes: "Lunes de productividad 🚀🔥",
      despues: "Lunes de productividad",
    });
    expect(propuesta?.evidencia).toHaveLength(2);
  });

  it("quitar ™ o © de una marca no es quitar emojis", () => {
    const marca = () => edicion("Lanzamos Café Ruta™ © 2026", "Lanzamos Café Ruta 2026");
    expect(proponerAjustesDeVoz([marca(), marca(), marca(), marca()], SIN_NADA)).toEqual([]);
  });

  it("‼️ con el selector de emoji sí cuenta como emoji", () => {
    const grito = () => edicion("¡Últimos lugares‼\uFE0F", "¡Últimos lugares!");
    expect(proponerAjustesDeVoz([grito(), grito(), grito(), grito()], SIN_NADA)[0]?.id).toBe(
      "emojis",
    );
  });

  it("con 3 no hay patrón", () => {
    const ediciones = [conEmojis(), conEmojis(), conEmojis(), intacta(), intacta()];
    expect(proponerAjustesDeVoz(ediciones, SIN_NADA)).toEqual([]);
  });

  it("mira solo las 6 más recientes: lo viejo no sostiene un patrón de hoy", () => {
    const viejas = [conEmojis(), conEmojis(), conEmojis(), conEmojis()];
    const nuevas = [intacta(), intacta(), intacta(), conEmojis(), intacta(), intacta()];
    expect(proponerAjustesDeVoz([...viejas, ...nuevas], SIN_NADA)).toEqual([]);
  });

  it("una sin emojis en el borrador no cuenta ni a favor ni en contra", () => {
    const sinEmojis = () => edicion("Texto sin nada", "Texto sin nada");
    const ediciones = [
      conEmojis(),
      sinEmojis(),
      conEmojis(),
      sinEmojis(),
      conEmojis(),
      conEmojis(),
    ];
    expect(proponerAjustesDeVoz(ediciones, SIN_NADA)[0]?.mensaje).toBe(
      "Quitaste emojis en 4 de tus últimas 4 publicaciones.",
    );
  });

  it("no la propone si un rasgo suyo ya lo dice", () => {
    const ediciones = [conEmojis(), conEmojis(), conEmojis(), conEmojis()];
    expect(proponerAjustesDeVoz(ediciones, { rasgos: ["Sin EMOJIS"], decisiones: {} })).toEqual([]);
  });

  it("un rasgo que dice lo contrario, o solo comparte la palabra, no la calla", () => {
    const emojis = [conEmojis(), conEmojis(), conEmojis(), conEmojis()];
    expect(
      proponerAjustesDeVoz(emojis, { rasgos: ["Usa muchos emojis"], decisiones: {} }),
    ).toHaveLength(1);
    expect(rasgoCubreRegla("Quita los emojis y cierra con punto", "emojis")).toBe(true);
    expect(rasgoCubreRegla("Nunca usa emojis", "emojis")).toBe(true);
    // "Frases cortas" es el largo de cada frase; "pregunta corta", de una pregunta.
    expect(rasgoCubreRegla("Frases cortas y directas", "largo")).toBe(false);
    expect(rasgoCubreRegla("Abre con una pregunta corta", "largo")).toBe(false);
    expect(rasgoCubreRegla("Textos breves, al grano", "largo")).toBe(true);
    expect(rasgoCubreRegla("Pocos signos de exclamación", "exclamaciones")).toBe(true);
  });

  it("después de un «No» solo cuentan las publicaciones posteriores", () => {
    const antes = [conEmojis(), conEmojis(), conEmojis(), conEmojis()];
    const decididaEn = new Date(reloj + 1).toISOString();
    const decisiones = { emojis: { decision: "descartada" as const, at: decididaEn } };
    expect(proponerAjustesDeVoz(antes, { rasgos: [], decisiones })).toEqual([]);

    const despues = [conEmojis(), conEmojis(), conEmojis(), conEmojis()];
    expect(proponerAjustesDeVoz([...antes, ...despues], { rasgos: [], decisiones })).toHaveLength(
      1,
    );
  });

  it("hashtags: del campo y escritos en el texto", () => {
    const tags = (): EdicionDePublicacion =>
      edicion("Café de olla #merida", "Café de olla", [["cafe", "yucatan"], []]);
    const [propuesta] = proponerAjustesDeVoz([tags(), tags(), tags(), tags()], SIN_NADA);
    expect(propuesta).toMatchObject({ id: "hashtags", rasgo: "Pocos hashtags" });
    expect(propuesta?.evidencia[0]).toEqual({
      antes: "#merida #cafe #yucatan",
      despues: "Sin hashtags",
    });
  });

  it("largo: recortar a 70% o menos un texto de 120+ caracteres", () => {
    const largo = "Hoy te cuento cómo organizo mi semana. ".repeat(5);
    const recortada = () => edicion(largo, largo.slice(0, 80));
    const apenas = () => edicion(largo, largo.slice(0, 180));
    expect(
      proponerAjustesDeVoz([recortada(), recortada(), recortada(), recortada()], SIN_NADA)[0]?.id,
    ).toBe("largo");
    expect(proponerAjustesDeVoz([apenas(), apenas(), apenas(), apenas()], SIN_NADA)).toEqual([]);
    // Un texto corto recortado no dice nada.
    const corto = () => edicion("Abrimos a las 8.", "Abrimos.");
    expect(proponerAjustesDeVoz([corto(), corto(), corto(), corto()], SIN_NADA)).toEqual([]);
  });

  it("exclamaciones: reducirlas a la mitad cuenta", () => {
    const grita = () => edicion("¡Ya llegó! ¡Corre!\nTe espero.", "¡Ya llegó, corre.\nTe espero.");
    const [propuesta] = proponerAjustesDeVoz([grita(), grita(), grita(), grita()], SIN_NADA);
    expect(propuesta).toMatchObject({ id: "exclamaciones", rasgo: "Pocos signos de exclamación" });
  });
});

describe("fueEditada", () => {
  it("compara texto y hashtags, sin espacios de las orillas ni mayúsculas en tags", () => {
    expect(fueEditada(edicion(" Hola ", "Hola", [["Cafe"], ["cafe"]]))).toBe(false);
    expect(fueEditada(edicion("Hola", "Hola", [["cafe"], []]))).toBe(true);
    expect(fueEditada(edicion("Hola", "Hola!"))).toBe(true);
  });
});

describe("textoDePublicacion", () => {
  it("normaliza los hashtags como al publicar", () => {
    expect(
      textoDePublicacion({
        archetype: "text_first",
        body: "x",
        hashtags: ["#cafe", "merida,yucatan"],
      })?.hashtags,
    ).toEqual(["cafe", "merida", "yucatan"]);
  });

  it("lee los tres arquetipos y rechaza lo que no reconoce", () => {
    expect(textoDePublicacion({ archetype: "text_first", body: "Hola", hashtags: ["a"] })).toEqual({
      texto: "Hola",
      hashtags: ["a"],
    });
    expect(
      textoDePublicacion({
        archetype: "video_script",
        hook: "H",
        script: "S",
        caption: "C",
        hashtags: [],
      })?.texto,
    ).toBe("H\n\nS\n\nC");
    expect(textoDePublicacion({ archetype: "otra" })).toBeNull();
    expect(textoDePublicacion(null)).toBeNull();
  });
});

describe("decisionesDeVoz", () => {
  it("ignora reglas que no existen y formas raras", () => {
    expect(
      decisionesDeVoz({
        emojis: { decision: "aceptada", at: "2026-11-01T00:00:00.000Z" },
        inventada: { decision: "aceptada", at: "x" },
      }),
    ).toEqual({ emojis: { decision: "aceptada", at: "2026-11-01T00:00:00.000Z" } });
    expect(decisionesDeVoz("basura")).toEqual({});
  });
});
