/**
 * F10.10: la dirección como se busca y se guarda en `web_reads`: con esquema
 * (el modelo a veces pasa "yucatan.com.mx/nota"), sin el `#fragmento` y sin la
 * puntuación que se pega al copiarla de una frase ("…en https://x.mx/nota.").
 * El `)` final no se quita: hay URLs que lo llevan (Wikipedia). Sin
 * dependencias, para que se pruebe sola.
 */
export function normalizeReadUrl(raw: string): string | null {
  let s = raw.trim().replace(/[.,;:!?»"'“”]+$/, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
