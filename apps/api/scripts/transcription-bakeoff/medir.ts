// Medidas puras del bake-off de transcripción (con su spec al lado).

/**
 * Normaliza para comparar palabras: minúsculas, sin puntuación y con los
 * espacios colapsados. Con `sinAcentos` también quita las tildes (la ñ se
 * queda: "año" y "ano" no son la misma palabra).
 */
export function normalizar(texto: string, { sinAcentos = false } = {}): string[] {
  // NFC primero: un acento descompuesto (un .txt guardado en macOS) partiría
  // la palabra en dos al quitar la puntuación.
  let t = texto.normalize("NFC").toLowerCase();
  if (sinAcentos) {
    // Solo las tildes y diéresis de las vocales: la ñ se queda.
    t = t
      .replace(/[áàäâ]/g, "a")
      .replace(/[éèëê]/g, "e")
      .replace(/[íìïî]/g, "i")
      .replace(/[óòöô]/g, "o")
      .replace(/[úùüû]/g, "u");
  }
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Word error rate: (sustituciones + borrados + inserciones) / palabras de la
 * referencia, por distancia de Levenshtein sobre palabras. Puede pasar de 1 si
 * la hipótesis inventa mucho.
 */
export function wer(
  referencia: string,
  hipotesis: string,
  opts: { sinAcentos?: boolean } = {},
): number {
  const r = normalizar(referencia, opts);
  const h = normalizar(hipotesis, opts);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= h.length; j++) {
      const costo = r[i - 1] === h[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + costo);
    }
    prev = cur;
  }
  return (prev[h.length] ?? 0) / r.length;
}

/**
 * Duración de un Ogg Opus (las notas de voz de Telegram) sin decodificarlo:
 * la posición de granulo de la última página, que en Opus siempre cuenta
 * muestras a 48 kHz, menos el pre-skip del encabezado. Undefined si no parece
 * un Ogg Opus.
 */
export function oggDurationSeconds(data: Uint8Array): number | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const esOggS = (i: number) =>
    data[i] === 0x4f && data[i + 1] === 0x67 && data[i + 2] === 0x67 && data[i + 3] === 0x53;
  if (data.length < 28 || !esOggS(0)) return undefined;
  // "OpusHead" en la primera página: pre-skip en el byte 10 del paquete.
  let preSkip = 0;
  const head = indexOf(data, "OpusHead", 0, 512);
  if (head === -1) return undefined;
  if (head + 12 <= data.length) preSkip = view.getUint16(head + 10, true);
  for (let i = data.length - 27; i >= 0; i--) {
    // Versión 0 del formato: filtra un "OggS" que caiga por azar dentro de un paquete.
    if (!esOggS(i) || data[i + 4] !== 0) continue;
    const granulo = view.getBigUint64(i + 6, true);
    if (granulo === 0xffffffffffffffffn) continue;
    return Math.max(0, Number(granulo) - preSkip) / 48_000;
  }
  return undefined;
}

function indexOf(data: Uint8Array, ascii: string, desde: number, hasta: number): number {
  const fin = Math.min(hasta, data.length - ascii.length);
  outer: for (let i = desde; i <= fin; i++) {
    for (let k = 0; k < ascii.length; k++) {
      if (data[i + k] !== ascii.charCodeAt(k)) continue outer;
    }
    return i;
  }
  return -1;
}
