import { describe, expect, it } from "vitest";
import type { Tx } from "../db/db.service.js";
import { MetricsEngineService, SEMANAS_CADENCIA } from "./metrics-engine.service.js";
import type {
  FilaComparable,
  FilaPublicacion,
  FilaPublicacionAnalizable,
  FilaUltimosNumeros,
  MetricsReadRepository,
} from "./metrics.read.repository.js";

// El motor se prueba sin Postgres: lo que decide acá es la clasificación en
// modos y la zona horaria, no el SQL. Las queries tienen su propio spec contra
// la base real (metrics.read.repository.spec.ts), que es donde sí hay algo que
// pueda mentir.

const TX = {} as Tx;
const MERIDA = "America/Mexico_City";
// Domingo 20 de septiembre, 13:00 en Mérida.
const AHORA = new Date("2026-09-20T19:00:00.000Z");

function repoFalso(
  comparables: FilaComparable[],
  publicaciones: FilaPublicacion[] = [],
): MetricsReadRepository {
  // Solo lo que Ritmo lee; las lecturas de Analíticas tienen su repo falso abajo.
  return {
    postsComparables: () => Promise.resolve(comparables),
    publicacionesPublicadas: () => Promise.resolve(publicaciones),
  } as unknown as MetricsReadRepository;
}

function comparable(campos: Partial<FilaComparable> = {}): FilaComparable {
  return {
    network: "facebook",
    platformPostId: `p-${Math.random()}`,
    publishedAt: new Date("2026-09-15T19:00:00.000Z"),
    reach: null,
    likes: 10,
    comments: null,
    shares: null,
    ...campos,
  };
}

describe("MetricsEngineService.horariosDe", () => {
  it("sin publicaciones en la ventana, la red está en cold", async () => {
    const motor = new MetricsEngineService(repoFalso([]));
    const resultado = await motor.horariosDe(TX, "facebook", { timezone: MERIDA, ahora: AHORA });
    expect(resultado.modo).toBe("cold");
    expect(resultado.ventanaDias).toBe(30);
  });

  it("publicó pero la red no reporta números: no es cold, es no_reporta", async () => {
    // LinkedIn personal y X caen exactamente acá. Decirle "seguí publicando
    // para desbloquear tus horarios" sería mentira: no hay nada que esperar.
    const mudos = [
      comparable({ network: "linkedin", likes: null }),
      comparable({ network: "linkedin", likes: null }),
    ];
    const motor = new MetricsEngineService(repoFalso(mudos));
    const resultado = await motor.horariosDe(TX, "linkedin", { timezone: MERIDA, ahora: AHORA });
    expect(resultado.modo).toBe("no_reporta");
  });

  it("solo mira los posts de la red que se le pide", async () => {
    const motor = new MetricsEngineService(
      repoFalso([comparable({ network: "facebook", likes: 5 })]),
    );
    const otra = await motor.horariosDe(TX, "linkedin", { timezone: MERIDA, ahora: AHORA });
    expect(otra.modo).toBe("cold");
  });

  it("agrupa por la hora local, no por la UTC", async () => {
    // 01:00Z es la franja 0 en UTC y las 19:00 —franja 6— en Mérida. Si la
    // conversión faltara, el heatmap recomendaría publicar de madrugada.
    const posts = Array.from({ length: 20 }, (_, i) =>
      comparable({
        publishedAt: new Date(`2026-09-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`),
        likes: 10,
      }),
    );
    const motor = new MetricsEngineService(repoFalso(posts));
    const resultado = await motor.horariosDe(TX, "facebook", { timezone: MERIDA, ahora: AHORA });

    expect(resultado.modo).toBe("full");
    const enFranja = (franja: number) =>
      resultado.celdas.filter((c) => c.franja === franja).reduce((suma, c) => suma + c.n, 0);
    expect(enFranja(6)).toBe(20);
    expect(enFranja(0)).toBe(0);
  });
});

describe("MetricsEngineService.cadencia", () => {
  it("devuelve semanas completas, empezando en lunes", async () => {
    const motor = new MetricsEngineService(repoFalso([], []));
    const resultado = await motor.cadencia(TX, { timezone: MERIDA, ahora: AHORA });
    // AHORA es domingo, así que la rejilla cierra la última semana justo hoy.
    expect(resultado.dias).toHaveLength(SEMANAS_CADENCIA * 7);
    expect(resultado.dias[0]?.dia).toBe("2026-06-01");
    expect(resultado.dias.at(-1)?.dia).toBe("2026-09-20");
  });

  it("cuenta la publicación en su día local", async () => {
    // Publicado el lunes 01:00Z = domingo 19:00 en Mérida.
    const motor = new MetricsEngineService(
      repoFalso([], [{ network: "facebook", publishedAt: new Date("2026-09-21T01:00:00.000Z") }]),
    );
    const resultado = await motor.cadencia(TX, { timezone: MERIDA, ahora: AHORA });
    const domingo = resultado.dias.find((d) => d.dia === "2026-09-20");
    expect(domingo).toMatchObject({ total: 1, porRed: { facebook: 1 } });
  });

  it("la racha sigue viva aunque hoy todavía no publiques", async () => {
    const motor = new MetricsEngineService(
      repoFalso(
        [],
        [
          { network: "facebook", publishedAt: new Date("2026-09-18T18:00:00.000Z") },
          { network: "facebook", publishedAt: new Date("2026-09-19T18:00:00.000Z") },
        ],
      ),
    );
    const resultado = await motor.cadencia(TX, { timezone: MERIDA, ahora: AHORA });
    expect(resultado.rachaActual).toBe(2);
    expect(resultado.mejorRacha).toBe(2);
    expect(resultado.total).toBe(2);
  });

  it("una racha vieja ya cortada no cuenta como actual", async () => {
    const motor = new MetricsEngineService(
      repoFalso(
        [],
        [
          { network: "facebook", publishedAt: new Date("2026-09-01T18:00:00.000Z") },
          { network: "facebook", publishedAt: new Date("2026-09-02T18:00:00.000Z") },
          { network: "facebook", publishedAt: new Date("2026-09-03T18:00:00.000Z") },
        ],
      ),
    );
    const resultado = await motor.cadencia(TX, { timezone: MERIDA, ahora: AHORA });
    expect(resultado.rachaActual).toBe(0);
    expect(resultado.mejorRacha).toBe(3);
  });
});

// ── Analíticas (F12) ─────────────────────────────────────────────────

function repoAnaliticas(datos: {
  comparables?: FilaComparable[];
  analizables?: FilaPublicacionAnalizable[];
  ultimos?: FilaUltimosNumeros[];
  hayPublicadas?: boolean;
}): MetricsReadRepository {
  return {
    postsComparables: () => Promise.resolve(datos.comparables ?? []),
    publicacionesPublicadas: () => Promise.resolve([]),
    publicacionesAnalizables: () => Promise.resolve(datos.analizables ?? []),
    publicacionYHermanas: () => Promise.resolve(datos.analizables ?? []),
    ultimosNumeros: () => Promise.resolve(datos.ultimos ?? []),
    hayPublicadas: () => Promise.resolve(datos.hayPublicadas ?? false),
  } as unknown as MetricsReadRepository;
}

function analizable(campos: Partial<FilaPublicacionAnalizable> = {}): FilaPublicacionAnalizable {
  return {
    cardId: `card-${Math.random()}`,
    network: "facebook",
    archetype: "text_first",
    content: null,
    groupId: null,
    chatId: null,
    carpeta: null,
    postUrl: null,
    platformPostId: `p-${Math.random()}`,
    publishedAt: new Date("2026-09-15T19:00:00.000Z"),
    ...campos,
  };
}

describe("MetricsEngineService.analizar: los mismos números que Ritmo a 30 días", () => {
  const ctx = { timezone: MERIDA, ahora: AHORA };
  const doce = (campos: (i: number) => Partial<FilaComparable>) =>
    Array.from({ length: 12 }, (_, i) =>
      comparable({
        publishedAt: new Date(Date.parse("2026-09-01T01:00:00.000Z") + i * 86_400_000),
        ...campos(i),
      }),
    );

  it.each([
    ["cold", [] as FilaComparable[]],
    ["no_reporta", doce(() => ({ likes: null }))],
    ["poca", doce(() => ({ likes: 10 })).slice(0, 6)],
    ["full con tasa", doce((i) => ({ likes: 10 + i, reach: 200 + 10 * i }))],
    [
      "full con interacciones (un reach en 0)",
      doce((i) => ({ likes: 10 + i, reach: i === 3 ? 0 : 500 })),
    ],
  ])("%s: misma base y misma muestra", async (_caso, comparables) => {
    const motor = new MetricsEngineService(repoAnaliticas({ comparables }));
    const ritmo = await motor.horariosDe(TX, "facebook", ctx);
    const { analisis } = await motor.analizar(TX, 30, ctx);
    const contexto = analisis.contextos.get("facebook");

    expect(contexto?.nReferencia ?? 0).toBe(ritmo.nTotal);
    if (ritmo.modo === "cold") expect(contexto).toBeUndefined();
    else expect(contexto?.base).toBe(ritmo.base);
    if (ritmo.modo === "no_reporta") expect(contexto?.muestra).toBe("no_reporta");
  });

  it("el promedio de la red es la media de los mismos valores que usa Ritmo", async () => {
    const comparables = doce((i) => ({ likes: 10 + i, reach: 100 }));
    const motor = new MetricsEngineService(repoAnaliticas({ comparables }));
    const { analisis } = await motor.analizar(TX, 30, ctx);
    // likes 10…21 sobre 100: la media es 0.155.
    expect(analisis.contextos.get("facebook")?.promedio).toBeCloseTo(0.155);
  });
});

describe("MetricsEngineService.analizar", () => {
  const ctx = { timezone: MERIDA, ahora: AHORA };

  it("sin nada en el periodo pregunta si alguna vez publicó (Cero absoluto)", async () => {
    const nunca = new MetricsEngineService(repoAnaliticas({ hayPublicadas: false }));
    expect((await nunca.analizar(TX, 7, ctx)).hayPublicaciones).toBe(false);
    const antes = new MetricsEngineService(repoAnaliticas({ hayPublicadas: true }));
    expect((await antes.analizar(TX, 7, ctx)).hayPublicaciones).toBe(true);
  });

  it("junta la card con sus últimos números por red y por id del post", async () => {
    const card = analizable({ platformPostId: "fb-1" });
    const motor = new MetricsEngineService(
      repoAnaliticas({
        analizables: [card],
        ultimos: [
          {
            network: "facebook",
            platformPostId: "fb-1",
            reach: 300,
            impressions: 500,
            likes: 12,
            comments: 3,
            shares: null,
            medidoEn: new Date("2026-09-20T18:00:00.000Z"),
            snapshots: 20,
          },
        ],
      }),
    );
    const { analisis, kpis } = await motor.analizar(TX, 30, ctx);
    expect(analisis.posts[0]).toMatchObject({ estado: "medida", interacciones: 15 });
    expect(kpis(null).alcance).toMatchObject({ total: 300, redes: ["facebook"] });
    expect(analisis.ultimaMedicion).toEqual(new Date("2026-09-20T18:00:00.000Z"));
  });
});

describe("MetricsEngineService.detalle", () => {
  const ctx = { timezone: MERIDA, ahora: AHORA };

  it("devuelve null si la card no está entre las publicadas", async () => {
    const motor = new MetricsEngineService(repoAnaliticas({ analizables: [analizable()] }));
    expect(await motor.detalle(TX, "otra", 30, ctx)).toBeNull();
  });

  it("separa la publicación de sus hermanas del mismo concepto", async () => {
    const propia = analizable({ cardId: "a", groupId: "g" });
    const hermana = analizable({ cardId: "b", groupId: "g", network: "instagram" });
    const motor = new MetricsEngineService(repoAnaliticas({ analizables: [propia, hermana] }));
    const detalle = await motor.detalle(TX, "a", 30, ctx);
    expect(detalle?.post.publicacion.cardId).toBe("a");
    expect(detalle?.hermanas.map((h) => h.publicacion.network)).toEqual(["instagram"]);
    // Sin snapshots y con más de 24 h: Presencia no la pudo seguir.
    expect(detalle?.post.estado).toBe("sin_medicion");
  });
});
