import { describe, expect, it } from "vitest";
import type { Tx } from "../db/db.service.js";
import { MetricsEngineService, SEMANAS_CADENCIA } from "./metrics-engine.service.js";
import type {
  FilaComparable,
  FilaPublicacion,
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
  return {
    postsComparables: () => Promise.resolve(comparables),
    publicacionesPublicadas: () => Promise.resolve(publicaciones),
  };
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
