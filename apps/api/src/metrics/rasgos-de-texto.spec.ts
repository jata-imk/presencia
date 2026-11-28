import { describe, expect, it } from "vitest";
import {
  abreConPregunta,
  baseDeHallazgoDeVoz,
  corteDeLargo,
  estadoDeVoz,
  fraseDeHallazgoDeVoz,
  idDePropuestaDeVozSchema,
  rasgoCubreRegla,
  rasgoDice,
  rasgoQueSeSuma,
  textoPublicado,
  tieneRasgo,
  type HallazgoVozDto,
} from "@presencia/shared";

// Los rasgos del texto (`packages/shared/src/rasgos-de-texto.ts`): los lee el
// hallazgo de voz de Analíticas y «Aprender de mis ediciones». Vive aquí
// porque shared no corre tests (igual que carousel.spec).

const t = (texto: string, hashtags: string[] = []) => ({ texto, hashtags });

describe("contadores", () => {
  it("abre con pregunta: con «¿», o si la primera oración termina en «?»", () => {
    expect(abreConPregunta(t("¿Ya desayunaste? Hoy toca café."))).toBe(true);
    expect(abreConPregunta(t("☕ ¿Ya desayunaste?"))).toBe(true);
    expect(abreConPregunta(t("Ya desayunaste?\nHoy toca café."))).toBe(true);
    expect(abreConPregunta(t("Hoy toca café. ¿Te late?"))).toBe(false);
    // El caption de un TikTok: el gancho, y la pregunta al final.
    expect(abreConPregunta(t("Tres apps ¿Cuál usas tú?"))).toBe(false);
    expect(abreConPregunta(t("Qué onda ¡Ya llegó!"))).toBe(false);
    expect(abreConPregunta(t(""))).toBe(false);
  });

  it("parte por rasgo: ninguno contra al menos uno; largo, en el corte", () => {
    expect(tieneRasgo("emojis", t("Hola ☕"), 0)).toBe(true);
    // El ™ de una marca no es un emoji (F12.5).
    expect(tieneRasgo("emojis", t("Presencia™"), 0)).toBe(false);
    expect(tieneRasgo("hashtags", t("Hola", ["cafe"]), 0)).toBe(true);
    expect(tieneRasgo("hashtags", t("Hola #cafe"), 0)).toBe(true);
    expect(tieneRasgo("hashtags", t("Hola"), 0)).toBe(false);
    expect(tieneRasgo("exclamaciones", t("¡Qué onda!"), 0)).toBe(true);
    expect(tieneRasgo("largo", t("12345"), 5)).toBe(true);
    expect(tieneRasgo("largo", t("1234"), 5)).toBe(false);
  });

  it("el corte de largo es la mediana de la red, redondeada", () => {
    expect(corteDeLargo([t("a"), t("abc"), t("abcde")])).toBe(3);
    expect(corteDeLargo([t("a"), t("ab"), t("abc"), t("abcd")])).toBe(3);
    expect(corteDeLargo([])).toBe(0);
  });

  it("en un video se lee el caption, no el guion que se dice", () => {
    const video = {
      archetype: "video_script",
      hook: "¡Mira esto! 🔥",
      script: "Hoy te cuento…",
      caption: "Tres apps",
      hashtags: ["productividad"],
      assetIds: [],
    };
    expect(textoPublicado(video)).toEqual({ texto: "Tres apps", hashtags: ["productividad"] });
    expect(textoPublicado({ archetype: "text_first", body: "Hola", hashtags: [] })).toEqual({
      texto: "Hola",
      hashtags: [],
    });
    expect(textoPublicado(null)).toBeNull();
  });
});

describe("qué dice «Así escribes»", () => {
  const casos: [string, Parameters<typeof rasgoDice>[1], "con" | "sin"][] = [
    ["Sin emojis", "emojis", "sin"],
    ["Casi sin emojis", "emojis", "sin"],
    ["Usa muchos emojis", "emojis", "con"],
    ["Pon un emoji al final", "emojis", "con"],
    ["Pocos hashtags", "hashtags", "sin"],
    ["Usa hashtags locales", "hashtags", "con"],
    ["Textos breves", "largo", "sin"],
    ["Al grano", "largo", "sin"],
    ["Textos largos y desarrollados", "largo", "con"],
    ["Abre con una pregunta corta", "pregunta", "con"],
    ["Abres con una pregunta que pica", "pregunta", "con"],
    ["Usas emojis con moderación", "emojis", "con"],
    ["Abre directo, sin pregunta", "pregunta", "sin"],
    ["Nunca abre con pregunta", "pregunta", "sin"],
    ["Pocos signos de exclamación", "exclamaciones", "sin"],
    ["Nunca: «¡Hola, familia!»", "exclamaciones", "sin"],
    ["Usa signos de exclamación", "exclamaciones", "con"],
  ];

  it.each(casos)("«%s» dice %s · %s, y no lo contrario", (nota, rasgo, lado) => {
    expect(rasgoDice(nota, rasgo, lado)).toBe(true);
    expect(rasgoDice(nota, rasgo, lado === "con" ? "sin" : "con")).toBe(false);
  });

  it("compartir la palabra no basta", () => {
    // "Pregunta corta" habla de la pregunta, no del largo del texto (F12.5).
    expect(rasgoDice("Abre con una pregunta corta", "largo", "sin")).toBe(false);
    // "Frases cortas" es el largo de cada frase, no del texto.
    expect(rasgoDice("Frases cortas", "largo", "sin")).toBe(false);
    // Un saludo con «¡…!» no dice que use muchas exclamaciones.
    expect(rasgoDice("Saluda con «¡Qué onda!»", "exclamaciones", "con")).toBe(false);
    // "un abrazo" no es "abre".
    expect(rasgoDice("Cierra con un abrazo y una pregunta", "pregunta", "con")).toBe(false);
    expect(rasgoDice("No usa emojis", "emojis", "con")).toBe(false);
    // Una cláusula por cosa: el "sin" de los emojis no alcanza a los hashtags.
    expect(rasgoDice("Sin emojis, usa hashtags", "hashtags", "con")).toBe(true);
    expect(rasgoDice("Sin emojis, usa hashtags", "hashtags", "sin")).toBe(false);
    expect(rasgoDice("Sin emojis, usa hashtags", "emojis", "sin")).toBe(true);
  });

  it("«Aprender de mis ediciones» sigue usando el mismo texto y la misma regla", () => {
    expect(rasgoQueSeSuma("emojis", "sin")).toBe("Casi sin emojis");
    expect(rasgoCubreRegla("Sin emojis", "emojis")).toBe(true);
    expect(rasgoCubreRegla("Usa muchos emojis", "emojis")).toBe(false);
  });
});

describe("estadoDeVoz", () => {
  it("propone, ya lo dice, lo contradice o no cabe", () => {
    expect(estadoDeVoz([], "emojis", "sin")).toEqual({ estado: "propone" });
    expect(estadoDeVoz(["Frases cortas", "Sin emojis"], "emojis", "sin")).toEqual({
      estado: "ya_lo_dice",
      rasgo: "Sin emojis",
    });
    expect(estadoDeVoz(["Usa muchos emojis"], "emojis", "sin")).toEqual({
      estado: "contradice",
      rasgo: "Usa muchos emojis",
    });
    const ocho = Array.from({ length: 8 }, (_, i) => `Rasgo ${String(i)}`);
    expect(estadoDeVoz(ocho, "emojis", "sin")).toEqual({ estado: "lleno" });
  });

  it("con la voz llena, lo que ya dice o contradice gana sobre «lleno»", () => {
    const llena = [...Array.from({ length: 7 }, (_, i) => `Rasgo ${String(i)}`), "Sin emojis"];
    expect(estadoDeVoz(llena, "emojis", "sin").estado).toBe("ya_lo_dice");
    expect(estadoDeVoz(llena, "emojis", "con").estado).toBe("contradice");
  });
});

describe("la llave de una decisión", () => {
  it("acepta las reglas y los hallazgos de voz bien formados, nada más", () => {
    expect(idDePropuestaDeVozSchema.safeParse("emojis").success).toBe(true);
    expect(idDePropuestaDeVozSchema.safeParse("m-emojis-sin-instagram").success).toBe(true);
    expect(idDePropuestaDeVozSchema.safeParse("m-pregunta-con-facebook").success).toBe(true);
    expect(idDePropuestaDeVozSchema.safeParse("m-emojis-sin-myspace").success).toBe(false);
    expect(idDePropuestaDeVozSchema.safeParse("m-tono-sin-instagram").success).toBe(false);
    expect(idDePropuestaDeVozSchema.safeParse("ia-1").success).toBe(false);
  });
});

describe("frases del hallazgo de voz", () => {
  const base: HallazgoVozDto = {
    tipo: "voz",
    network: "instagram",
    rasgo: "emojis",
    ganador: "sin",
    corte: null,
    diferenciaPct: 31,
    nGanador: 6,
    nPerdedor: 8,
    propuesta: {
      id: "m-emojis-sin-instagram",
      rasgo: "Casi sin emojis",
      voz: { estado: "propone" },
    },
  };

  it("en pasado, con su red y su base (lore doc §5)", () => {
    expect(fraseDeHallazgoDeVoz(base)).toEqual({
      antes: "En Instagram, tus publicaciones sin emojis tuvieron ",
      numero: "31% más interacción",
      despues: " que las que sí llevan.",
    });
    expect(baseDeHallazgoDeVoz(base)).toBe(
      "Basado en 14 publicaciones de Instagram (6 sin, 8 con)",
    );
  });

  it("el largo dice su corte; desde el doble, en veces", () => {
    const largo = { ...base, rasgo: "largo" as const, corte: 180, diferenciaPct: 140 };
    expect(fraseDeHallazgoDeVoz(largo)).toEqual({
      antes: "En Instagram, tus publicaciones de menos de 180 caracteres tuvieron ",
      numero: "2.4 veces más interacción",
      despues: " que las más largas.",
    });
    expect(baseDeHallazgoDeVoz(largo)).toBe(
      "Basado en 14 publicaciones de Instagram (6 más cortas, 8 más largas)",
    );
  });

  it("abre con pregunta", () => {
    const pregunta = { ...base, rasgo: "pregunta" as const, ganador: "con" as const };
    expect(fraseDeHallazgoDeVoz(pregunta).antes).toBe(
      "En Instagram, tus publicaciones que abren con una pregunta tuvieron ",
    );
    expect(baseDeHallazgoDeVoz(pregunta)).toBe(
      "Basado en 14 publicaciones de Instagram (6 con pregunta, 8 sin pregunta)",
    );
  });
});
