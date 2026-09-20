// Cada cuándo vale la pena volver a preguntarle al proveedor por un post.
//
// El job corre cada 6 h, pero preguntar por TODO en cada pase sería gastar
// cuota para traer el mismo número: las redes reportan con horas de retraso y
// un post de tres semanas ya no se mueve. La política escalona por edad del
// post, que es donde está la señal — lo que distingue un post que funcionó de
// uno que no pasa en sus primeras horas.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Más viejo que esto, ya no se mide. Coincide con el techo de la policy del barrido. */
export const EDAD_MAXIMA_DIAS = 30;

/** Hasta acá, cada pase: son las horas en las que el post todavía se mueve. */
const EDAD_CALIENTE_DIAS = 2;

/** Hasta acá, una vez al día. Después, una vez por semana. */
const EDAD_TIBIA_DIAS = 14;

export interface FrescuraInput {
  publishedAt: Date;
  /** Día del último snapshot guardado (`YYYY-MM-DD`, UTC), o null si nunca se midió. */
  ultimoSnapshot: string | null;
  ahora: Date;
}

/** `YYYY-MM-DD` en UTC. El día del snapshot es UTC en toda la fase (ADR-021). */
export function diaUtc(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Decide si este post entra en el pase.
 *
 * Un post nunca medido entra siempre (mientras esté dentro de la ventana):
 * la primera medición es la que no se puede recuperar después.
 */
export function debeMedirse({ publishedAt, ultimoSnapshot, ahora }: FrescuraInput): boolean {
  const edadDias = (ahora.getTime() - publishedAt.getTime()) / MS_POR_DIA;
  // Publicado "en el futuro" (reloj torcido, o un published_at mal escrito):
  // no se descarta, se trata como recién publicado.
  if (edadDias > EDAD_MAXIMA_DIAS) return false;
  if (!ultimoSnapshot) return true;

  const diasDesdeMedicion = diasEntreDias(ultimoSnapshot, diaUtc(ahora));
  if (edadDias <= EDAD_CALIENTE_DIAS) return true;
  if (edadDias <= EDAD_TIBIA_DIAS) return diasDesdeMedicion >= 1;
  return diasDesdeMedicion >= 7;
}

/**
 * Días enteros entre dos `YYYY-MM-DD`. Se comparan DÍAS y no instantes a
 * propósito: la fila del snapshot es por día, así que "ya lo medí hoy" es la
 * pregunta, no "lo medí hace menos de 24 h".
 */
function diasEntreDias(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00.000Z`);
  const b = Date.parse(`${hasta}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / MS_POR_DIA);
}
