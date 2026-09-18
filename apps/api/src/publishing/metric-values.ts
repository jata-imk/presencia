/**
 * Estrecha un número de métrica que llega de un proveedor.
 *
 * Upload-Post los manda como number; PostFast manda los contadores como
 * bigint SERIALIZADO COMO STRING ("1234") y solo los de video y las tasas de
 * Instagram como number. Nada valida esas respuestas en runtime, así que se
 * aceptan las dos formas y se descarta todo lo demás.
 *
 * Lo que NO se hace es convertir la ausencia en `0`: si la red no reportó la
 * métrica, el valor es `null` y así llega a la columna. `0` es "nadie lo vio"
 * y `null` es "no sabemos" — confundirlos haría que Ritmo promediara ceros
 * inventados (ADR-021).
 */
export function parseMetricNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Una fecha inválida NO es null, así que sobreviviría a un `?? new Date()` y
 * llegaría hasta el UPDATE, que tronaría y abortaría el pase entero.
 */
export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
