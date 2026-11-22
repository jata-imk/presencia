import { describe, expect, it } from "vitest";
import type { SocialNetwork } from "@presencia/shared";
import {
  analizarPeriodo,
  clave,
  contextosDeRed,
  contextoVacio,
  desdeComparables,
  desdePublicaciones,
  kpisDe,
  numerosDe,
  type EntradaAnalisis,
  type PublicacionMedible,
  type UltimosNumeros,
} from "./analisis.js";
import type { PostComparable } from "./engagement.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const AHORA = new Date("2026-11-20T18:00:00.000Z");

let secuencia = 0;

function publicacion(
  campos: Partial<PublicacionMedible> & { haceHoras: number },
): PublicacionMedible {
  secuencia += 1;
  const { haceHoras, ...resto } = campos;
  return {
    cardId: `card-${secuencia}`,
    network: "instagram",
    platformPostId: `post-${secuencia}`,
    publishedAt: new Date(AHORA.getTime() - haceHoras * HORA),
    ...resto,
  };
}

function ultimos(campos: Partial<UltimosNumeros> = {}): UltimosNumeros {
  return {
    reach: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    medidoEn: new Date(AHORA.getTime() - HORA),
    snapshots: 1,
    ...campos,
  };
}

/** El punto de 24 h de una publicación, con sus interacciones en `likes`. */
function comparable(
  pub: PublicacionMedible,
  likes: number | null,
  reach: number | null = 1000,
): PostComparable {
  return {
    network: pub.network,
    platformPostId: pub.platformPostId ?? "",
    publishedAt: pub.publishedAt,
    reach,
    likes,
    comments: null,
    shares: null,
  };
}

/** Una entrada con publicaciones medidas igual hoy que a las 24 h. */
function entradaCon(
  filas: { pub: PublicacionMedible; likes: number | null; reach?: number | null }[],
  periodoDias = 30,
): EntradaAnalisis<PublicacionMedible> {
  const map = new Map<string, UltimosNumeros>();
  const comparables: PostComparable[] = [];
  for (const { pub, likes, reach = 1000 } of filas) {
    if (!pub.platformPostId) continue;
    map.set(clave(pub.network, pub.platformPostId), ultimos({ likes, reach }));
    if (AHORA.getTime() - pub.publishedAt.getTime() >= DIA) {
      comparables.push(comparable(pub, likes, reach));
    }
  }
  return {
    ahora: AHORA,
    periodoDias,
    publicaciones: filas.map((f) => f.pub),
    ultimos: map,
    comparables,
  };
}

/** `n` publicaciones de una red, una por día empezando hace `desdeDias`. */
function serie(
  network: SocialNetwork,
  n: number,
  likes: (i: number) => number | null,
  desdeDias = 2,
  reach: number | null = 1000,
) {
  return Array.from({ length: n }, (_, i) => ({
    pub: publicacion({ network, haceHoras: (desdeDias + i) * 24 }),
    likes: likes(i),
    reach,
  }));
}

describe("numerosDe: los cuatro estados", () => {
  const poca = { ...contextoVacio("instagram"), muestra: "poca" as const };

  it("sin id del post en la red es `sin_medicion`, aunque sea reciente", () => {
    const pub = publicacion({ haceHoras: 1, platformPostId: null });
    expect(numerosDe(pub, undefined, undefined, poca, AHORA).estado).toBe("sin_medicion");
  });

  it("un solo número de cualquiera de las cinco métricas es `medida`", () => {
    const pub = publicacion({ haceHoras: 3 });
    expect(numerosDe(pub, ultimos({ impressions: 40 }), undefined, poca, AHORA).estado).toBe(
      "medida",
    );
  });

  it("reciente y sin números es `en_camino`, se haya medido o no", () => {
    const pub = publicacion({ haceHoras: 2 });
    expect(numerosDe(pub, undefined, undefined, poca, AHORA).estado).toBe("en_camino");
    expect(numerosDe(pub, ultimos(), undefined, poca, AHORA).estado).toBe("en_camino");
  });

  it("en una red que no reporta es `no_reporta` desde la primera hora (LinkedIn personal)", () => {
    const pub = publicacion({ haceHoras: 2, network: "linkedin" });
    const noReporta = { ...contextoVacio("linkedin"), muestra: "no_reporta" as const };
    expect(numerosDe(pub, ultimos(), undefined, noReporta, AHORA).estado).toBe("no_reporta");
  });

  it("con 24 h: medida y vacía es `no_reporta`; nunca medida es `sin_medicion`", () => {
    const pub = publicacion({ haceHoras: 30 });
    expect(numerosDe(pub, ultimos(), undefined, poca, AHORA).estado).toBe("no_reporta");
    expect(numerosDe(pub, undefined, undefined, poca, AHORA).estado).toBe("sin_medicion");
    expect(numerosDe(pub, ultimos({ snapshots: 0 }), undefined, poca, AHORA).estado).toBe(
      "sin_medicion",
    );
  });

  it("las interacciones suman lo que hay, sin convertir `null` en 0", () => {
    const pub = publicacion({ haceHoras: 30 });
    const n = numerosDe(pub, ultimos({ likes: 7, shares: 2 }), undefined, poca, AHORA);
    expect(n.interacciones).toBe(9);
    expect(numerosDe(pub, ultimos({ reach: 50 }), undefined, poca, AHORA).interacciones).toBeNull();
  });
});

describe("contextosDeRed y lift", () => {
  it("con 9 publicaciones medidas no hay promedio ni lift; con 10, sí", () => {
    const nueve = entradaCon(serie("instagram", 9, () => 50));
    expect(contextosDeRed(nueve.comparables, AHORA, 30).get("instagram")).toMatchObject({
      muestra: "poca",
      nReferencia: 9,
      promedio: null,
    });

    const diez = entradaCon(serie("instagram", 10, (i) => (i === 0 ? 100 : 50)));
    const contexto = contextosDeRed(diez.comparables, AHORA, 30).get("instagram");
    // base tasa: 9 × 0.05 + 0.1 = 0.55 / 10 = 0.055.
    expect(contexto?.muestra).toBe("suficiente");
    expect(contexto?.promedio).toBeCloseTo(0.055);
    const analisis = analizarPeriodo(diez);
    const mejor = analisis.posts.find((p) => p.publicacion === diez.publicaciones[0]);
    // 0.1 / 0.055 − 1 = 81.8% → 82.
    expect(mejor?.lift).toBe(82);
  });

  it("una red sin ninguna interacción reportada es `no_reporta`, con su conteo", () => {
    const entrada = entradaCon(serie("linkedin", 12, () => null, 2, null));
    expect(contextosDeRed(entrada.comparables, AHORA, 30).get("linkedin")).toMatchObject({
      muestra: "no_reporta",
      nReferencia: 12,
    });
  });

  it("la ventana de referencia es el periodo o 30 días, lo más largo", () => {
    // 10 publicaciones hace 40–49 días: fuera con 30, dentro con 90.
    const entrada = entradaCon(
      serie("instagram", 10, () => 50, 40),
      90,
    );
    expect(contextosDeRed(entrada.comparables, AHORA, 30).get("instagram")).toBeUndefined();
    expect(contextosDeRed(entrada.comparables, AHORA, 90).get("instagram")?.muestra).toBe(
      "suficiente",
    );
  });

  it("una publicación sin punto de 24 h no tiene lift aunque la red tenga promedio", () => {
    const filas = [
      ...serie("instagram", 10, () => 50),
      { pub: publicacion({ haceHoras: 5 }), likes: 80 },
    ];
    const analisis = analizarPeriodo(entradaCon(filas));
    const reciente = analisis.posts.find((p) => p.publicacion === filas[10]?.pub);
    expect(reciente?.estado).toBe("medida");
    expect(reciente?.lift).toBeNull();
  });
});

describe("redes sin punto de 24 h y redes con puntos vacíos", () => {
  it("una red nueva toma la base de sus últimos números, no `interacciones` fija", () => {
    // Tres publicaciones de Instagram de las últimas 20 horas, todas con alcance.
    const filas = [5, 12, 20].map((horas) => ({
      pub: publicacion({ haceHoras: horas }),
      likes: 40,
    }));
    const red = analizarPeriodo(entradaCon(filas)).redes[0];
    expect(red?.engagement).toMatchObject({ muestra: "sin_datos", base: "tasa" });
    // 40 / 1000: una tasa, no "40".
    expect(red?.engagement.valor).toBeCloseTo(0.04);
  });

  it("si los puntos de 24 h vinieron vacíos pero los de después no, el número de hoy se ve", () => {
    // La red quedó `no_reporta` por sus puntos de 24 h (un proveedor que falló
    // un rato), pero las mediciones posteriores sí trajeron likes.
    const filas = serie("facebook", 3, () => 12);
    const entrada = entradaCon(filas);
    const vacios: EntradaAnalisis<PublicacionMedible> = {
      ...entrada,
      comparables: entrada.comparables.map((post) => ({ ...post, likes: null, reach: null })),
    };
    const analisis = analizarPeriodo(vacios);
    expect(analisis.contextos.get("facebook")?.muestra).toBe("no_reporta");
    expect(analisis.posts.every((post) => post.estado === "medida")).toBe(true);
    expect(analisis.redes[0]?.engagement.valor).toBe(12);
    expect(analisis.redes[0]?.tendencia.some((v) => v !== null)).toBe(true);
  });
});

describe("kpisDe", () => {
  it("el alcance suma solo las redes que lo reportan, y dice cuáles", () => {
    const entrada = entradaCon([
      ...serie("instagram", 3, () => 10, 2, 500),
      ...serie("tiktok", 3, () => 10, 2, null),
    ]);
    const kpis = kpisDe(analizarPeriodo(entrada), entrada, null);
    expect(kpis.alcance.total).toBe(1500);
    expect(kpis.alcance.redes).toEqual(["instagram"]);
    // Las interacciones sí se suman entre redes: son conteos de lo mismo.
    expect(kpis.interacciones.total).toBe(60);
    // Y el engagement nunca es un número global: una entrada por red.
    expect(kpis.engagement.map((e) => e.network)).toEqual(["instagram", "tiktok"]);
    expect(kpis.engagement.find((e) => e.network === "tiktok")?.base).toBe("interacciones");
  });

  it("sin ninguna red con alcance, el total es `null` (no 0)", () => {
    const entrada = entradaCon(serie("tiktok", 3, () => 10, 2, null));
    expect(kpisDe(analizarPeriodo(entrada), entrada, null).alcance).toEqual({
      total: null,
      cambioPct: null,
      redes: [],
    });
  });

  it("ordena las redes por publicaciones, con las que no reportan al final", () => {
    const entrada = entradaCon([
      // LinkedIn es la que más publicó, pero no trae un solo número.
      ...serie("linkedin", 5, () => null, 2, null),
      ...serie("facebook", 2, () => 4),
      ...serie("instagram", 3, () => 10),
      ...serie("tiktok", 2, () => 6, 2, null),
    ]);
    const analisis = analizarPeriodo(entrada);
    const orden = ["instagram", "facebook", "tiktok", "linkedin"];
    expect(analisis.redes.map((r) => r.network)).toEqual(orden);
    // La lista del resumen es la misma lista, en el mismo orden.
    expect(kpisDe(analisis, entrada, null).engagement.map((e) => e.network)).toEqual(orden);
  });

  it("el filtro de red es una rebanada del mismo análisis", () => {
    const entrada = entradaCon([
      ...serie("instagram", 3, () => 10),
      ...serie("facebook", 2, () => 4),
    ]);
    const analisis = analizarPeriodo(entrada);
    const kpis = kpisDe(analisis, entrada, "facebook");
    expect(kpis.publicaciones.total).toBe(2);
    expect(kpis.interacciones.total).toBe(8);
    expect(kpis.engagement.map((e) => e.network)).toEqual(["facebook"]);
  });

  it("el cambio de publicaciones es absoluto, y `null` si el periodo anterior no tuvo", () => {
    const soloAhora = entradaCon(
      serie("instagram", 4, () => 10, 1),
      7,
    );
    expect(kpisDe(analizarPeriodo(soloAhora), soloAhora, null).publicaciones).toEqual({
      total: 4,
      cambio: null,
    });

    const conAnterior = entradaCon(
      [...serie("instagram", 4, () => 10, 1), ...serie("instagram", 6, () => 10, 8)],
      7,
    );
    expect(kpisDe(analizarPeriodo(conAnterior), conAnterior, null).publicaciones).toEqual({
      total: 4,
      cambio: -2,
    });
  });

  it("los cambios se miden a 24 h, con ventanas corridas, y se callan con menos de 5", () => {
    // Periodo de 7 días. Ventana actual del cambio: publicadas hace 1–8 días;
    // anterior: hace 8–15. Cinco en cada una.
    const actual = serie("instagram", 5, () => 30, 1.5); // 1.5…5.5 días
    const anterior = serie("instagram", 5, () => 20, 9); // 9…13 días
    const entrada = entradaCon([...actual, ...anterior], 7);
    const kpis = kpisDe(analizarPeriodo(entrada), entrada, null);
    // 150 contra 100.
    expect(kpis.interacciones.cambioPct).toBe(50);
    // Alcance: 5000 contra 5000.
    expect(kpis.alcance.cambioPct).toBe(0);
    // Engagement en tasa: 0.03 − 0.02, en fracción (la UI lo dice en puntos).
    expect(kpis.engagement[0]?.cambio).toBeCloseTo(0.01);

    const corta = entradaCon([...actual, ...anterior.slice(0, 4)], 7);
    const sinCambio = kpisDe(analizarPeriodo(corta), corta, null);
    expect(sinCambio.interacciones.cambioPct).toBeNull();
    expect(sinCambio.engagement[0]?.cambio).toBeNull();
  });

  it("una publicación de menos de 24 h no entra al cambio aunque esté en el periodo", () => {
    const actual = serie("instagram", 5, () => 30, 1.5);
    const anterior = serie("instagram", 5, () => 20, 9);
    const entrada = entradaCon([...actual, ...anterior], 7);
    // Una de hace 3 horas con 1000 interacciones: en el total, no en el cambio.
    const reciente = publicacion({ haceHoras: 3 });
    const conReciente: EntradaAnalisis<PublicacionMedible> = {
      ...entrada,
      publicaciones: [...entrada.publicaciones, reciente],
      ultimos: new Map([
        ...entrada.ultimos,
        [clave(reciente.network, reciente.platformPostId ?? ""), ultimos({ likes: 1000 })],
      ]),
    };
    const kpis = kpisDe(analizarPeriodo(conReciente), conReciente, null);
    expect(kpis.interacciones.total).toBe(1150);
    expect(kpis.interacciones.cambioPct).toBe(50);
  });
});

describe("analizarPeriodo", () => {
  it("lista solo el periodo, de la más nueva a la más vieja", () => {
    const entrada = entradaCon(
      [...serie("instagram", 3, () => 10, 1), ...serie("instagram", 3, () => 10, 10)],
      7,
    );
    const analisis = analizarPeriodo(entrada);
    expect(analisis.posts).toHaveLength(3);
    const tiempos = analisis.posts.map((p) => p.publicacion.publishedAt.getTime());
    expect([...tiempos].sort((a, b) => b - a)).toEqual(tiempos);
  });

  it.each([
    [7, 7],
    [30, 5],
    [90, 9],
  ])("con %i días la tendencia tiene %i tramos iguales", (periodo, tramos) => {
    const entrada = entradaCon([{ pub: publicacion({ haceHoras: 2 }), likes: 10 }], periodo);
    const red = analizarPeriodo(entrada).redes[0];
    expect(red?.tendencia).toHaveLength(tramos);
    // La publicación de hace 2 horas cae en el último tramo; los demás, vacíos.
    expect(red?.tendencia.at(-1)).not.toBeNull();
    expect(red?.tendencia.slice(0, -1).every((v) => v === null)).toBe(true);
  });

  it("una red que no reporta cuenta sus publicaciones y no inventa números", () => {
    const entrada = entradaCon(serie("linkedin", 4, () => null, 2, null));
    const red = analizarPeriodo(entrada).redes[0];
    expect(red).toMatchObject({
      network: "linkedin",
      publicaciones: 4,
      alcance: null,
      interacciones: null,
      engagement: { muestra: "no_reporta", valor: null, cambio: null },
    });
  });

  it("la última medición mira solo lo que la ingesta sigue midiendo (≤ 30 días)", () => {
    const vieja = publicacion({ haceHoras: 40 * 24 });
    const nueva = publicacion({ haceHoras: 48 });
    const entrada: EntradaAnalisis<PublicacionMedible> = {
      ahora: AHORA,
      periodoDias: 90,
      publicaciones: [vieja, nueva],
      ultimos: new Map([
        [
          clave(vieja.network, vieja.platformPostId ?? ""),
          ultimos({ medidoEn: new Date(AHORA.getTime() - HORA) }),
        ],
        [
          clave(nueva.network, nueva.platformPostId ?? ""),
          ultimos({ medidoEn: new Date(AHORA.getTime() - 5 * HORA) }),
        ],
      ]),
      comparables: [],
    };
    expect(analizarPeriodo(entrada).ultimaMedicion).toEqual(new Date(AHORA.getTime() - 5 * HORA));
  });

  it("lee publicaciones del periodo y el anterior, nunca menos de 30 días", () => {
    // 7 días: 14 no alcanzan para "Medido hace" (la ingesta mide hasta 30).
    expect(desdePublicaciones(AHORA, 7)).toEqual(new Date(AHORA.getTime() - 30 * DIA));
    expect(desdePublicaciones(AHORA, 90)).toEqual(new Date(AHORA.getTime() - 180 * DIA));
  });

  it("lee comparables desde la ventana más vieja que necesita", () => {
    // 7 días: la referencia (30) es más vieja que el cambio anterior (15).
    expect(desdeComparables(AHORA, 7)).toEqual(new Date(AHORA.getTime() - 30 * DIA));
    // 90 días: el cambio anterior (180 + 1) es más viejo que la referencia (90).
    expect(desdeComparables(AHORA, 90)).toEqual(new Date(AHORA.getTime() - 181 * DIA));
  });
});
