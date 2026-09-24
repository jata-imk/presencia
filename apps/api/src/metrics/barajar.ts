// Un barajado de verdad, en su propio módulo por lo mismo que `frescura.ts` y
// `engagement.ts`: sin DB ni Nest ni env, para poder probarlo directo.

/**
 * Fisher-Yates.
 *
 * `sort(() => Math.random() - 0.5)` NO baraja, y era lo que había. `sort`
 * necesita un comparador consistente —si `a` va antes que `b`, `b` tiene que ir
 * después que `a`, siempre— y uno al azar rompe ese contrato: el resultado no
 * es una permutación uniforme sino lo que salga del algoritmo interno. Con diez
 * elementos o menos V8 usa insertion sort, que bajo un comparador aleatorio deja
 * el orden casi intacto.
 *
 * O sea que con pocos usuarios, que es el caso real, se quedaban sin medir
 * siempre los mismos — exactamente lo que barajar existe para evitar.
 */
export function barajar<T>(items: readonly T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    // Los dos índices están en rango por construcción, así que el aserto es
    // para `noUncheckedIndexedAccess` y nada más.
    //
    // La primera versión usaba `if (eni === undefined) continue` para el mismo
    // fin, y era un sesgo escondido: con un `T` que admita `undefined` esa
    // rama SALTA el intercambio en vez de hacerlo, y esos elementos se quedan
    // cerca de donde estaban. O sea justo la clase de bug que este módulo
    // existe para borrar, dentro de la única función que tiene que ser
    // confiable.
    const eni = copia[i] as T;
    const enj = copia[j] as T;
    copia[i] = enj;
    copia[j] = eni;
  }
  return copia;
}
