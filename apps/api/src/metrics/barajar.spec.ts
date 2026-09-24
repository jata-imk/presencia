import { describe, expect, it } from "vitest";
import { barajar } from "./barajar.js";

// Lo que se prueba es justo lo que el código anterior no cumplía. El pase
// usaba `sort(() => Math.random() - 0.5)`, que parece un barajado y no lo es:
// `sort` exige un comparador consistente y uno al azar rompe ese contrato, así
// que el resultado depende del algoritmo interno. Con diez elementos o menos
// V8 usa insertion sort y el orden queda casi intacto — o sea que al final de
// la lista le tocaba casi nunca, que es lo contrario de repartir.

describe("barajar", () => {
  it("devuelve una permutación: ni pierde ni duplica ni toca el original", () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copia = [...original];
    const revuelto = barajar(original);

    expect(revuelto).toHaveLength(original.length);
    expect([...revuelto].sort((a, b) => a - b)).toEqual(copia);
    expect(original).toEqual(copia);
  });

  it("reparte: cada elemento cae en cada posición alguna vez", () => {
    // Esta es la que habría cazado el bug. Con el comparador al azar, el
    // elemento del final se quedaba en el final casi siempre y las posiciones
    // lejanas nunca se visitaban.
    const N = 5;
    const vistas = Array.from({ length: N }, () => new Set<number>());
    for (let corrida = 0; corrida < 600; corrida += 1) {
      const revuelto = barajar([0, 1, 2, 3, 4]);
      revuelto.forEach((valor, posicion) => vistas[posicion]?.add(valor));
    }
    for (const posicion of vistas) {
      expect(posicion.size).toBe(N);
    }
  });

  it("no se cae con vacío ni con un solo elemento", () => {
    expect(barajar([])).toEqual([]);
    expect(barajar(["solo"])).toEqual(["solo"]);
  });

  it("tampoco se sesga cuando los elementos pueden ser undefined", () => {
    // La primera versión de esta función saltaba el intercambio cuando un
    // elemento era `undefined` —era un truco para noUncheckedIndexedAccess— y
    // eso los dejaba clavados cerca de su posición original. Nadie lo notaba
    // porque el único llamador pasa tuplas, pero era un sesgo escondido dentro
    // de la única función que tiene que repartir bien.
    const posiciones = new Set<number>();
    for (let corrida = 0; corrida < 400; corrida += 1) {
      const revuelto = barajar<string | undefined>(["a", undefined, "c", "d"]);
      posiciones.add(revuelto.indexOf(undefined));
    }
    expect(posiciones).toEqual(new Set([0, 1, 2, 3]));
  });
});
