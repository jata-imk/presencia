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
    const eni = copia[i];
    const enj = copia[j];
    // Ambos índices están en rango por construcción; el chequeo es para
    // noUncheckedIndexedAccess, no una posibilidad real.
    if (eni === undefined || enj === undefined) continue;
    copia[i] = enj;
    copia[j] = eni;
  }
  return copia;
}
