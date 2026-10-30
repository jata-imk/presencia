// F10.10: lo que comparten la extracción del HTML (en el worker) y la del PDF
// y el texto (en el hilo principal). Sin dependencias: el hilo principal no
// tiene por qué cargar linkedom ni Readability para usar dos funciones de texto.

/** Lo que se guarda de una página. Lo que ve el modelo es menos (el tope de contexto). */
export const WEB_READ_MAX_CHARS = 60_000;

export type ExtractedPage =
  | {
      ok: true;
      title: string | null;
      siteName: string | null;
      text: string;
      /** Se guardó solo el inicio (WEB_READ_MAX_CHARS), o la descarga ya venía cortada. */
      truncated: boolean;
      /** Solo había la descripción de la página, no su cuerpo. */
      onlyDescription: boolean;
    }
  | { ok: false; detail: string };

export function capped(
  title: string | null,
  siteName: string | null,
  text: string,
  truncated: boolean,
  onlyDescription: boolean,
): ExtractedPage {
  if (text.length <= WEB_READ_MAX_CHARS) {
    return { ok: true, title, siteName, text, truncated, onlyDescription };
  }
  return {
    ok: true,
    title,
    siteName,
    text: `${text.slice(0, WEB_READ_MAX_CHARS)}…`,
    truncated: true,
    onlyDescription,
  };
}

/** Espacios colapsados por línea, sin más de una línea en blanco seguida. */
export function normalize(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      // `\s` incluye el espacio duro (&nbsp;); dentro de una línea ya no hay saltos.
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
