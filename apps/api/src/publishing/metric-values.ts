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
 *
 * Y se exige ENTERO, no solo finito. Las cinco columnas normalizadas son
 * `bigint`: un `0.07` —PostFast manda las tasas de Instagram como number y
 * Facebook devuelve promedios— haría que Postgres rechazara el INSERT, y ese
 * INSERT vive en la única transacción del usuario, así que se llevaría
 * puestos todos los snapshots ya juntados para él, en cada pase. Un valor
 * fraccionario no es un contador; su lugar es `raw`, donde sigue estando.
 */
export function parseMetricNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Una fecha inválida NO es null: `new Date("no-es-fecha")` da un objeto Date
 * que sobrevive a cualquier `?? new Date()` y llega hasta el UPDATE, donde
 * Postgres lo rechaza y se lleva por delante el batch entero — incluidas las
 * filas que ya estaban listas para escribirse. Fue el motivo original en
 * `reconcileDueCards` y vale igual para el pase de métricas. Ante un
 * timestamp que no se entiende, mejor `null`: el caller cae a "ahora".
 */
export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
