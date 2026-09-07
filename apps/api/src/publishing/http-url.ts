/**
 * Estrecha un valor a una URL http(s) segura de guardar y de renderizar.
 *
 * Se aplica en DOS lugares a propósito, y no es redundancia:
 *
 *  - En el adapter, para que nunca entre basura a `publication_cards.post_url`.
 *  - En `toDto`, porque ahí es donde el valor SE CONSUME: el frontend lo mete
 *    directo en un `href`, y un `javascript:` ahí ejecuta script en el origen
 *    de la app al hacer clic (`rel="noopener"` no protege de eso). La columna
 *    la puede llenar un adapter futuro o un UPDATE a mano; el invariante tiene
 *    que valer para la fila, no para el camino por el que llegó.
 *
 * También filtra lo que no sea string: `request<T>()` de los adapters es un
 * cast, no validación, y un valor de otro tipo llegando a un UPDATE tumbaría
 * el batch entero de reconciliación.
 */
export function parseHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : null;
}
