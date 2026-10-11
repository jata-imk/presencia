/**
 * Tokens aproximados de un texto: ~4 caracteres por token. No es exacto, pero
 * es estable, y una sola fuente para la ventana del chat, el tramo a resumir y
 * el tope de los bloques del resumen: si se ajusta el cociente, se mueven
 * juntos.
 */
export function estimateTextTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
