// Cada cuándo vale la pena volver a preguntarle al proveedor por un post, y
// con qué resolución se guarda lo que traiga.
//
// Las dos preguntas son UNA SOLA acá, y esa es la idea: cada post cae en un
// "bucket" según su edad, y se mide si el bucket de ahora no es el último que
// se midió. La fila que se escribe lleva ese bucket como llave, así que la
// frecuencia de medición y la resolución de la serie no pueden divergir —
// medir de más no genera puntos nuevos, sobrescribe el mismo renglón.
//
// La escalera está pensada sobre dónde pasa algo: un post hace casi todo en
// sus primeras horas, y a los diez días ya no se mueve.
//
//   0 – 12 h   → 1 hora    (12 puntos)
//   12 – 48 h  → 6 horas   ( 6 puntos)
//   2 – 14 d   → 1 día     (12 puntos)
//   14 – 30 d  → 3 días    ( 5 puntos)
//   > 30 d     → no se mide
//
// Son ~35 puntos por post, y cuestan ~35 mediciones: no se paga ninguna
// request que no deje un punto. Con la política plana anterior (una fila por
// día) medir 8 veces al día costaba 8 requests para guardar 1 punto.
//
// Los bordes de los buckets están alineados al reloj UTC, no a la hora de
// publicación: así dos pases del mismo bucket escriben la misma fila aunque
// hayan mirado posts distintos, y la serie de dos posts es comparable.

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/** Más viejo que esto, ya no se mide. Coincide con el techo de la policy del barrido. */
export const EDAD_MAXIMA_DIAS = 30;

const CORTE_HORARIO_HORAS = 12;
const CORTE_SEIS_HORAS_DIAS = 2;
const CORTE_DIARIO_DIAS = 14;

export interface FrescuraInput {
  publishedAt: Date;
  /** Bucket del último snapshot guardado, o null si nunca se midió. */
  ultimoBucket: Date | null;
  ahora: Date;
}

/**
 * El bucket en el que cae este post AHORA, o `null` si ya salió de la ventana.
 *
 * Es también la llave temporal de la fila: `post_metrics.snapshot_at`.
 */
export function bucketDe(publishedAt: Date, ahora: Date): Date | null {
  const edadMs = ahora.getTime() - publishedAt.getTime();
  // Publicado "en el futuro" (reloj torcido, o un published_at mal escrito):
  // no se descarta, se trata como recién publicado.
  const edadHoras = edadMs / MS_POR_HORA;
  const edadDias = edadMs / MS_POR_DIA;
  if (edadDias > EDAD_MAXIMA_DIAS) return null;
  if (edadHoras <= CORTE_HORARIO_HORAS) return truncar(ahora, MS_POR_HORA);
  if (edadDias <= CORTE_SEIS_HORAS_DIAS) return truncar(ahora, 6 * MS_POR_HORA);
  if (edadDias <= CORTE_DIARIO_DIAS) return truncar(ahora, MS_POR_DIA);
  return truncar(ahora, 3 * MS_POR_DIA);
}

/**
 * Decide si este post entra en el pase.
 *
 * Un post nunca medido entra siempre (mientras esté dentro de la ventana): la
 * primera medición es la que no se puede recuperar después.
 */
export function debeMedirse({ publishedAt, ultimoBucket, ahora }: FrescuraInput): boolean {
  const bucket = bucketDe(publishedAt, ahora);
  if (!bucket) return false;
  if (!ultimoBucket) return true;
  // Distinto bucket = punto nuevo que guardar. Igual = la fila ya existe y
  // volver a pedirla gastaría cuota para sobrescribirla con casi lo mismo.
  return bucket.getTime() !== ultimoBucket.getTime();
}

/**
 * Trunca hacia abajo a un múltiplo del tamaño, contando desde la época Unix.
 *
 * Desde la época y no desde medianoche porque el tramo de 3 días necesita un
 * origen estable: con "medianoche" habría que elegir cuál, y el ancho del
 * último bucket de cada mes cambiaría. Los tamaños de 1 h, 6 h y 1 día dividen
 * exacto al día, así que sus bordes caen igual con cualquiera de los dos
 * criterios.
 */
function truncar(fecha: Date, tamanoMs: number): Date {
  return new Date(Math.floor(fecha.getTime() / tamanoMs) * tamanoMs);
}
