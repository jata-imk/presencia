import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { MuestraDeRed, SocialNetwork } from "@presencia/shared";
import type { ContextoDeRed, PostAnalizado } from "./analisis.js";
import {
  compararGrupos,
  formatoPublicado,
  hallazgosDe,
  hallazgosDeVoz,
  type PublicacionConFormato,
} from "./hallazgos.js";

const ZONA = "America/Merida";

// 2026-11-16 es lunes. A las 15:00Z son las 09:00 en Mérida: el mismo día.
const LUNES = Date.parse("2026-11-16T15:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

const TEXTO = { archetype: "text_first", body: "Hola", hashtags: [], assetIds: [] };
const IMAGEN = {
  archetype: "visual_first",
  caption: "Hola",
  hashtags: [],
  assetIds: [randomUUID()],
};
const CARRUSEL = (() => {
  const slides = [randomUUID(), randomUUID(), randomUUID()].map((assetId) => ({
    id: randomUUID(),
    assetId,
  }));
  return {
    archetype: "visual_first",
    caption: "Hola",
    hashtags: [],
    assetIds: slides.map((s) => s.assetId),
    slides,
  };
})();

let secuencia = 0;

interface Opciones {
  network?: SocialNetwork;
  /** 0 = lunes. Cada semana hacia atrás se repite el mismo día. */
  dia?: number;
  semana?: number;
  content?: unknown;
  archetype?: PublicacionConFormato["archetype"];
  publishedAt?: Date;
}

function post(a24h: number | null, op: Opciones = {}): PostAnalizado<PublicacionConFormato> {
  secuencia += 1;
  const content = op.content ?? TEXTO;
  const archetype =
    op.archetype ?? (content as { archetype: PublicacionConFormato["archetype"] }).archetype;
  return {
    publicacion: {
      cardId: `card-${secuencia}`,
      network: op.network ?? "instagram",
      platformPostId: `post-${secuencia}`,
      publishedAt:
        op.publishedAt ??
        new Date(LUNES + (op.dia ?? 0) * DIA - (op.semana ?? secuencia % 12) * 7 * DIA),
      archetype,
      content,
    },
    estado: "medida",
    ultimos: null,
    interacciones: null,
    a24h,
    lift: null,
  };
}

function contexto(network: SocialNetwork, muestra: MuestraDeRed = "suficiente"): ContextoDeRed {
  return { network, base: "tasa", muestra, nReferencia: 20, promedio: 0.05 };
}

function contextos(...lista: ContextoDeRed[]): Map<SocialNetwork, ContextoDeRed> {
  return new Map(lista.map((c) => [c.network, c]));
}

/** `n` posts con el mismo valor. */
function varios(n: number, valor: number, op: Opciones = {}) {
  return Array.from({ length: n }, (_, i) => post(valor, { ...op, semana: i }));
}

describe("formatoPublicado", () => {
  it("lee el formato de lo que se publicó, no el arquetipo", () => {
    expect(formatoPublicado("text_first", TEXTO)).toBe("texto");
    expect(formatoPublicado("visual_first", IMAGEN)).toBe("imagen");
    expect(formatoPublicado("visual_first", CARRUSEL)).toBe("carrusel");
    expect(formatoPublicado("video_script", {})).toBe("video");
  });

  it("un carrusel con una sola imagen salió como imagen suelta", () => {
    const unaImagen = {
      ...CARRUSEL,
      assetIds: CARRUSEL.assetIds.slice(0, 1),
      slides: [CARRUSEL.slides[0], { id: randomUUID() }],
    };
    expect(formatoPublicado("visual_first", unaImagen)).toBe("imagen");
    expect(formatoPublicado("visual_first", { ...unaImagen, assetIds: [] })).toBe("texto");
  });

  it("un visual sin imagen cuenta como texto", () => {
    expect(formatoPublicado("visual_first", { ...IMAGEN, assetIds: [] })).toBe("texto");
  });

  it("un contenido ilegible no entra a ninguna cubeta", () => {
    expect(formatoPublicado("visual_first", { basura: true })).toBeNull();
  });
});

describe("compararGrupos: las tres pruebas", () => {
  const cinco = (v: number) => [v, v, v, v, v];

  it("pasa con 5 contra 5 y 25% o más", () => {
    // Enteros (interacciones por publicación): 5 / 4 es 1.25 exacto, sin
    // el redondeo binario de 0.0625 / 0.05.
    expect(compararGrupos(cinco(5), cinco(4))).toEqual({
      diferenciaPct: 25,
      nGanador: 5,
      nPerdedor: 5,
    });
  });

  it("4 contra 5 calla, aunque la diferencia sea enorme", () => {
    expect(compararGrupos([0.2, 0.2, 0.2, 0.2], cinco(0.05))).toBeNull();
    expect(compararGrupos(cinco(0.2), [0.05, 0.05, 0.05, 0.05])).toBeNull();
  });

  it("24% calla", () => {
    expect(compararGrupos(cinco(0.062), cinco(0.05))).toBeNull();
  });

  it("una diferencia que solo sostiene un viral calla", () => {
    // Con el viral: (0.3 + 4×0.05) / 5 = 0.1, el doble. Sin él: 0.05, empate.
    expect(compararGrupos([0.3, 0.05, 0.05, 0.05, 0.05], cinco(0.05))).toBeNull();
  });

  it("un post roto en el perdedor tampoco fabrica una diferencia", () => {
    // Con el cero: 10 contra 8, +25%. Sin él: 10 contra 10, empate.
    expect(compararGrupos(cinco(10), [10, 10, 10, 10, 0])).toBeNull();
  });

  it("solo prueba la dirección que se pide", () => {
    expect(compararGrupos(cinco(0.05), cinco(0.1))).toBeNull();
  });

  it("sin interacción en el perdedor no hay porcentaje que decir", () => {
    expect(compararGrupos(cinco(10), cinco(0))).toBeNull();
  });
});

describe("hallazgosDe: formato", () => {
  it("encuentra el formato que rindió más, con su base", () => {
    const posts = [
      ...varios(6, 0.09, { content: CARRUSEL }),
      ...varios(8, 0.05, { content: TEXTO }),
    ];
    const { hayMuestra, hallazgos } = hallazgosDe(
      posts,
      contextos(contexto("instagram")),
      ZONA,
      null,
    );
    expect(hayMuestra).toBe(true);
    expect(hallazgos).toContainEqual({
      tipo: "formato",
      network: "instagram",
      ganador: "carrusel",
      perdedor: "texto",
      diferenciaPct: 80,
      nGanador: 6,
      nPerdedor: 8,
    });
  });

  it("con varios pares que pasan, se queda con la mayor diferencia", () => {
    const posts = [
      ...varios(5, 0.12, { content: CARRUSEL }),
      ...varios(5, 0.08, { content: IMAGEN }),
      ...varios(5, 0.05, { content: TEXTO }),
    ];
    const formato = hallazgosDe(
      posts,
      contextos(contexto("instagram")),
      ZONA,
      null,
    ).hallazgos.filter((h) => h.tipo === "formato");
    expect(formato).toHaveLength(1);
    expect(formato[0]).toMatchObject({
      ganador: "carrusel",
      perdedor: "texto",
      diferenciaPct: 140,
    });
  });
});

describe("hallazgosDe: día de la semana", () => {
  it("compara un día contra el resto, en la hora del creator", () => {
    // Las 01:00Z del martes son las 19:00 del lunes en Mérida.
    const lunesNoche = (semana: number) =>
      new Date(Date.parse("2026-11-17T01:00:00.000Z") - semana * 7 * DIA);
    const posts = [
      ...Array.from({ length: 6 }, (_, i) => post(0.1, { publishedAt: lunesNoche(i) })),
      ...[1, 2, 3, 4].flatMap((dia) => varios(2, 0.05, { dia })),
    ];
    const dia = hallazgosDe(posts, contextos(contexto("instagram")), ZONA, null).hallazgos.find(
      (h) => h.tipo === "dia",
    );
    expect(dia).toMatchObject({
      ganador: { dia: 0 },
      diferenciaPct: 100,
      nGanador: 6,
      nPerdedor: 8,
    });
  });

  it("fin de semana contra entre semana", () => {
    const posts = [
      ...varios(3, 0.1, { dia: 5 }),
      ...varios(3, 0.1, { dia: 6 }),
      ...[0, 1, 2, 3, 4].flatMap((dia) => varios(2, 0.05, { dia })),
    ];
    const dia = hallazgosDe(posts, contextos(contexto("instagram")), ZONA, null).hallazgos.find(
      (h) => h.tipo === "dia",
    );
    expect(dia).toMatchObject({ ganador: "fin_de_semana", nGanador: 6, nPerdedor: 10 });
  });

  it("un día flojo no se dice solo: sale como la otra cara de la semana", () => {
    // Domingo muy bajo: lo que gana es "entre semana" o ningún corte, nunca
    // "tus publicaciones de domingo tuvieron menos".
    const posts = [
      ...varios(6, 0.02, { dia: 6 }),
      ...[0, 1, 2, 3, 4, 5].flatMap((dia) => varios(2, 0.05, { dia })),
    ];
    const dias = hallazgosDe(posts, contextos(contexto("instagram")), ZONA, null).hallazgos.filter(
      (h) => h.tipo === "dia",
    );
    expect(dias).toHaveLength(1);
    expect(dias[0]?.tipo === "dia" && dias[0].ganador).toBe("entre_semana");
  });
});

describe("hallazgosDe: muestra y alcance", () => {
  const fuerte = () => [
    ...varios(6, 0.09, { content: CARRUSEL }),
    ...varios(8, 0.05, { content: TEXTO }),
  ];

  it("una red sin muestra suficiente (menos de 10) calla, y lo dice", () => {
    const resultado = hallazgosDe(fuerte(), contextos(contexto("instagram", "poca")), ZONA, null);
    expect(resultado).toEqual({ hayMuestra: false, hallazgos: [] });
  });

  it("con muestra pero sin diferencia que se sostenga, no inventa nada", () => {
    const parejo = [...varios(6, 0.05, { content: CARRUSEL }), ...varios(8, 0.05)];
    expect(hallazgosDe(parejo, contextos(contexto("instagram")), ZONA, null)).toEqual({
      hayMuestra: true,
      hallazgos: [],
    });
  });

  it("nunca compara redes: los carruseles de Instagram no se miden contra el texto de LinkedIn", () => {
    const posts = [
      ...varios(6, 0.09, { content: CARRUSEL, network: "instagram" }),
      ...varios(8, 0.05, { content: TEXTO, network: "linkedin" }),
    ];
    const { hallazgos } = hallazgosDe(
      posts,
      contextos(contexto("instagram"), contexto("linkedin")),
      ZONA,
      null,
    );
    expect(hallazgos.filter((h) => h.tipo === "formato")).toEqual([]);
  });

  it("con una red elegida, solo los de esa red", () => {
    const posts = [
      ...fuerte(),
      ...varios(6, 0.09, { content: CARRUSEL, network: "facebook" }),
      ...varios(8, 0.05, { content: TEXTO, network: "facebook" }),
    ];
    const ctx = contextos(contexto("instagram"), contexto("facebook"));
    const { hallazgos } = hallazgosDe(posts, ctx, ZONA, "facebook");
    expect(hallazgos.length).toBeGreaterThan(0);
    expect(hallazgos.every((h) => h.network === "facebook")).toBe(true);
    expect(hallazgosDe(posts, ctx, ZONA, "tiktok")).toEqual({ hayMuestra: false, hallazgos: [] });
  });

  it("los posts sin valor a 24 h no cuentan para la muestra del grupo", () => {
    const posts = [
      ...varios(4, 0.09, { content: CARRUSEL }),
      post(null, { content: CARRUSEL }),
      ...varios(8, 0.05),
    ];
    const formato = hallazgosDe(
      posts,
      contextos(contexto("instagram")),
      ZONA,
      null,
    ).hallazgos.filter((h) => h.tipo === "formato");
    expect(formato).toEqual([]);
  });

  it("uno por (tipo, red), y como máximo tres, de mayor a menor diferencia", () => {
    const redes: SocialNetwork[] = ["instagram", "facebook", "linkedin"];
    const posts = redes.flatMap((network, i) => [
      // Formato y día a la vez: carruseles de lunes contra texto del resto.
      ...varios(6, 0.09 + i * 0.01, { content: CARRUSEL, network, dia: 0 }),
      ...[1, 2, 3, 4].flatMap((dia) => varios(2, 0.05, { content: TEXTO, network, dia })),
    ]);
    const { hallazgos } = hallazgosDe(
      posts,
      contextos(...redes.map((r) => contexto(r))),
      ZONA,
      null,
    );
    expect(hallazgos).toHaveLength(3);
    const llaves = hallazgos.map((h) => `${h.tipo}:${h.network}`);
    expect(new Set(llaves).size).toBe(3);
    const diferencias = hallazgos.map((h) => h.diferenciaPct);
    expect(diferencias).toEqual([...diferencias].sort((a, b) => b - a));
    expect(hallazgos.every((h) => h.network === "linkedin" || h.network === "facebook")).toBe(true);
  });
});

describe("hallazgosDe: rasgo del texto (voz)", () => {
  // Mismo largo (11) para que el corte de largo no parta nada: el ☕ es una
  // sola unidad de UTF-16.
  const texto = (body: string, hashtags: string[] = []) => ({
    archetype: "text_first",
    body,
    hashtags,
    assetIds: [],
  });
  const SIN = texto("Hola amigos");
  const CON_EMOJI = texto("Hola amigo☕");
  const ctx = contextos(contexto("instagram"));
  const voz = (posts: PostAnalizado<PublicacionConFormato>[], descartes?: Map<string, Date>) =>
    hallazgosDe(posts, ctx, ZONA, null, descartes).hallazgos.filter((h) => h.tipo === "voz");

  it("sin emojis tuvo más: lo nombra con su base", () => {
    const posts = [
      ...varios(6, 0.09, { content: SIN }),
      ...varios(8, 0.05, { content: CON_EMOJI }),
    ];
    expect(voz(posts)).toEqual([
      {
        tipo: "voz",
        network: "instagram",
        rasgo: "emojis",
        ganador: "sin",
        corte: null,
        diferenciaPct: 80,
        nGanador: 6,
        nPerdedor: 8,
      },
    ]);
  });

  it("y al revés: con emojis tuvo más", () => {
    const posts = [
      ...varios(6, 0.09, { content: CON_EMOJI }),
      ...varios(8, 0.05, { content: SIN }),
    ];
    expect(voz(posts)).toMatchObject([{ rasgo: "emojis", ganador: "con", nGanador: 6 }]);
  });

  it("largo contra corto se parte en la mediana de la red, y la dice", () => {
    const posts = [
      ...varios(7, 0.09, { content: texto("Corto") }),
      ...varios(7, 0.05, { content: texto("Un texto bastante más largo") }),
    ];
    expect(voz(posts)).toMatchObject([
      { rasgo: "largo", ganador: "sin", corte: 16, nGanador: 7, nPerdedor: 7 },
    ]);
  });

  it("abre con una pregunta", () => {
    const posts = [
      ...varios(6, 0.09, { content: texto("¿Ya viste eso?") }),
      ...varios(8, 0.05, { content: texto("Ya viste esto.") }),
    ];
    expect(voz(posts)).toMatchObject([{ rasgo: "pregunta", ganador: "con" }]);
  });

  it("en un video se lee el caption: los emojis del guion no cuentan", () => {
    const video = (script: string) => ({
      archetype: "video_script",
      hook: "Tres apps",
      script,
      caption: "Hola amigos",
      hashtags: [],
      assetIds: [],
    });
    const posts = [
      ...varios(6, 0.09, { content: video("Mira ☕☕"), network: "tiktok" }),
      ...varios(8, 0.05, { content: video("Mira esto"), network: "tiktok" }),
    ];
    const { hallazgos } = hallazgosDe(posts, contextos(contexto("tiktok")), ZONA, null);
    expect(hallazgos.filter((h) => h.tipo === "voz")).toEqual([]);
  });

  describe("después de un «No»", () => {
    // Dos rasgos que se sostienen igual: el emoji y el "!" van juntos.
    const CON_LOS_DOS = texto("Hola amig!☕");
    const fuerte = () => [
      ...varios(6, 0.09, { content: SIN }),
      ...varios(8, 0.05, { content: CON_LOS_DOS }),
    ];
    const dijoNo = new Date(LUNES + DIA);
    const despues = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        post(0.09, { content: SIN, publishedAt: new Date(LUNES + (2 + i) * DIA) }),
      );

    it("sin publicaciones nuevas calla, y el siguiente rasgo toma su lugar", () => {
      expect(voz(fuerte())).toMatchObject([{ rasgo: "emojis", ganador: "sin" }]);
      const callado = voz(fuerte(), new Map([["m-emojis-sin-instagram", dijoNo]]));
      expect(callado).toMatchObject([{ rasgo: "exclamaciones", ganador: "sin" }]);
    });

    it("con 4 publicaciones nuevas sigue callado; con 5 vuelve a preguntar", () => {
      const descartes = new Map([
        ["m-emojis-sin-instagram", dijoNo],
        ["m-exclamaciones-sin-instagram", dijoNo],
      ]);
      expect(voz([...fuerte(), ...despues(4)], descartes)).toEqual([]);
      expect(voz([...fuerte(), ...despues(5)], descartes)).toMatchObject([
        { rasgo: "emojis", ganador: "sin", nGanador: 11 },
      ]);
    });

    it("un «No» en otra red no calla esta", () => {
      expect(voz(fuerte(), new Map([["m-emojis-sin-facebook", dijoNo]]))).toMatchObject([
        { rasgo: "emojis" },
      ]);
    });
  });

  it("uno de voz por red en la sección; Configuración los ve todos (hasta 3)", () => {
    const posts = [
      ...varios(6, 0.09, { content: SIN }),
      ...varios(8, 0.05, { content: texto("Hola amig!☕") }),
    ];
    expect(voz(posts)).toHaveLength(1);
    expect(hallazgosDeVoz(posts, ctx, ZONA).map((h) => h.rasgo)).toEqual([
      "emojis",
      "exclamaciones",
    ]);
  });

  it("la voz compite por el tope de 3 con formato y día", () => {
    const redes: SocialNetwork[] = ["instagram", "facebook"];
    const posts = redes.flatMap((network) => [
      // Carruseles de lunes sin emojis contra texto con emojis del resto:
      // formato, día y voz a la vez en cada red.
      ...varios(6, 0.09, { content: { ...CARRUSEL, caption: "Hola amigos" }, network, dia: 0 }),
      ...[1, 2, 3, 4].flatMap((dia) => varios(2, 0.05, { content: CON_EMOJI, network, dia })),
    ]);
    const { hallazgos } = hallazgosDe(
      posts,
      contextos(...redes.map((r) => contexto(r))),
      ZONA,
      null,
    );
    expect(hallazgos).toHaveLength(3);
  });
});
