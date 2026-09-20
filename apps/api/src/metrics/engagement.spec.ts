import { describe, expect, it } from "vitest";
import {
  baseDeRed,
  calcularHorarios,
  franjaDe,
  interaccionesDe,
  N_MINIMO_GRUPO,
  N_MINIMO_RED,
  valorDe,
  type PostComparable,
  type PostUbicado,
} from "./engagement.js";

// Aritmética pura: sin DB y sin reloj. Los casos son los que de verdad
// muerden —NULL mezclado con 0, base mixta, celdas justo abajo del umbral—,
// no el camino feliz.

function post(campos: Partial<PostComparable>): PostComparable {
  return {
    network: "facebook",
    platformPostId: "p1",
    publishedAt: new Date("2026-09-01T18:00:00.000Z"),
    reach: null,
    likes: null,
    comments: null,
    shares: null,
    ...campos,
  };
}

describe("interaccionesDe", () => {
  it("un post con los tres campos en null no aporta nada", () => {
    expect(interaccionesDe(post({}))).toBeNull();
  });

  it("distingue el cero real de la ausencia", () => {
    // LinkedIn personal no reporta: null. Un post que nadie tocó: 0. El
    // primero no entra al promedio, el segundo sí y lo baja — y esa diferencia
    // es justo la que ADR-021 declara regla dura.
    expect(interaccionesDe(post({ likes: 0, comments: 0, shares: 0 }))).toEqual({
      total: 0,
      camposReportados: 3,
    });
    expect(interaccionesDe(post({ likes: null, comments: null, shares: null }))).toBeNull();
  });

  it("suma solo los campos reportados y dice cuántos fueron", () => {
    expect(interaccionesDe(post({ likes: 5, comments: null, shares: 2 }))).toEqual({
      total: 7,
      camposReportados: 2,
    });
  });
});

describe("baseDeRed", () => {
  it("usa tasa solo si todos los posts con datos traen reach", () => {
    const todos = [post({ likes: 5, reach: 100 }), post({ likes: 9, reach: 300 })];
    expect(baseDeRed(todos)).toBe("tasa");
  });

  it("cae a interacciones absolutas si a uno le falta el reach", () => {
    const mixto = [post({ likes: 5, reach: 100 }), post({ likes: 9, reach: null })];
    expect(baseDeRed(mixto)).toBe("interacciones");
  });

  it("los posts sin números no cuentan para elegir la base", () => {
    // El que no reporta nada no tiene reach tampoco; si contara, arrastraría
    // la red entera a conteos absolutos aunque todos los demás den tasa.
    const conUnMudo = [post({ likes: 5, reach: 100 }), post({})];
    expect(baseDeRed(conUnMudo)).toBe("tasa");
  });

  it("un reach de 0 no habilita la tasa", () => {
    // Dividir entre cero daría Infinity y el "+%" saldría como un número
    // enorme perfectamente formateado.
    expect(baseDeRed([post({ likes: 5, reach: 0 })])).toBe("interacciones");
  });
});

describe("valorDe", () => {
  it("la tasa es interacciones sobre alcance", () => {
    expect(valorDe(post({ likes: 5, comments: 5, reach: 100 }), "tasa")).toBe(0.1);
  });

  it("devuelve null en vez de dividir entre cero aunque le pidan tasa", () => {
    expect(valorDe(post({ likes: 5, reach: 0 }), "tasa")).toBeNull();
  });
});

describe("franjaDe", () => {
  it("cubre el día completo en ocho franjas de tres horas", () => {
    expect(franjaDe(0)).toBe(0);
    expect(franjaDe(3)).toBe(1);
    expect(franjaDe(19)).toBe(6);
    expect(franjaDe(23)).toBe(7);
  });
});

/** N posts en la misma franja, repartidos entre los días que se pidan. */
function ubicados(franja: number, valor: number, dias: readonly number[]): PostUbicado[] {
  return dias.map((diaSemana) => ({ diaSemana, franja, valor }));
}

describe("calcularHorarios", () => {
  it("sin publicaciones es cold, no un heatmap de ceros", () => {
    expect(calcularHorarios([], "interacciones").modo).toBe("cold");
  });

  it("por debajo del mínimo de la red no publica ningún número", () => {
    const pocos = ubicados(6, 10, [0, 1, 2, 3, 4, 5, 6, 0, 1]);
    expect(pocos).toHaveLength(N_MINIMO_RED - 1);
    const resultado = calcularHorarios(pocos, "interacciones");
    expect(resultado.modo).toBe("poca");
    expect(resultado.celdas).toEqual([]);
  });

  it("con N suficiente pero ninguna franja al umbral, sigue siendo poca", () => {
    // Doce posts repartidos en ocho franjas: la red alcanza el mínimo, ningún
    // grupo llega a cinco. Hay datos y aun así no hay nada honesto que decir.
    const disperso: PostUbicado[] = [];
    for (let i = 0; i < 12; i++) {
      disperso.push({ diaSemana: i % 7, franja: i % 8, valor: 10 });
    }
    expect(calcularHorarios(disperso, "interacciones").modo).toBe("poca");
  });

  it("la celda que no llega al umbral hereda el lift de su franja", () => {
    // 10 posts fuertes en la franja 6 (repartidos 2 por día, ninguna celda
    // llega a 5) y 10 flojos en la franja 2. Promedio general = 15.
    const posts = [
      ...ubicados(6, 20, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]),
      ...ubicados(2, 10, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]),
    ];
    const resultado = calcularHorarios(posts, "interacciones");
    expect(resultado.modo).toBe("full");

    const celda = resultado.celdas.find((c) => c.diaSemana === 0 && c.franja === 6);
    expect(celda).toMatchObject({ n: 2, heredado: true, lift: 33 });

    const floja = resultado.celdas.find((c) => c.diaSemana === 0 && c.franja === 2);
    expect(floja).toMatchObject({ heredado: true, lift: -33 });
  });

  it("la celda que sí llega al umbral usa su propio número", () => {
    const posts = [
      // Cinco el mismo día y franja: esta celda se gana su lift.
      ...ubicados(6, 30, [1, 1, 1, 1, 1]),
      ...ubicados(6, 10, [2, 3, 4, 5, 6]),
      ...ubicados(2, 10, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]),
    ];
    const resultado = calcularHorarios(posts, "interacciones");
    const propia = resultado.celdas.find((c) => c.diaSemana === 1 && c.franja === 6);
    expect(propia?.n).toBe(N_MINIMO_GRUPO);
    expect(propia?.heredado).toBe(false);
  });

  it("una celda vacía tiene intensidad 0 y una floja no", () => {
    const posts = [
      ...ubicados(6, 20, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]),
      ...ubicados(2, 1, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]),
    ];
    const celdas = calcularHorarios(posts, "interacciones").celdas;
    // Franja 7: nadie publicó nunca ahí.
    expect(celdas.find((c) => c.diaSemana === 0 && c.franja === 7)?.intensidad).toBe(0);
    // Franja 2: publicó y rindió mal. Mal no es lo mismo que inexistente.
    expect(celdas.find((c) => c.diaSemana === 0 && c.franja === 2)?.intensidad).toBe(1);
  });

  it("si nadie interactuó con nada, no inventa un porcentaje", () => {
    // Todos los valores en 0 son un dato real (nadie reaccionó), pero el "+%"
    // se calcula contra el promedio general y ese promedio es 0.
    const planos = ubicados(6, 0, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]);
    expect(calcularHorarios(planos, "interacciones").modo).toBe("poca");
  });

  it("devuelve la rejilla completa de 7 días por 8 franjas", () => {
    const posts = [
      ...ubicados(6, 20, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]),
      ...ubicados(2, 10, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]),
    ];
    expect(calcularHorarios(posts, "interacciones").celdas).toHaveLength(7 * 8);
  });
});
