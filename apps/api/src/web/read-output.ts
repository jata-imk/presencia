import { normalizeTrendSource, type ReadLinkOutput } from "@presencia/shared";
import type { WebReadRow } from "./web-reads.repository.js";

// F10.10: la referencia que guarda la parte de `leer_enlace`. Sin dependencias
// de Nest ni de la base, para que la tool y sus tests la usen sin arrastrar el
// entorno.

export function outputOf(row: WebReadRow): ReadLinkOutput {
  return {
    readId: row.id,
    url: row.url,
    urlFinal: row.finalUrl,
    titulo: row.title,
    dominio: normalizeTrendSource(row.finalUrl ?? row.url),
    estado: row.status,
    truncado: row.truncated,
    soloDescripcion: row.onlyDescription,
  };
}

/** Una lectura que no llegó a guardarse: la dirección no se pudo armar, o el tope del turno. */
export function failedOutput(url: string, estado: ReadLinkOutput["estado"]): ReadLinkOutput {
  return {
    readId: null,
    url,
    urlFinal: null,
    titulo: null,
    dominio: normalizeTrendSource(url),
    estado,
    truncado: false,
    soloDescripcion: false,
  };
}
