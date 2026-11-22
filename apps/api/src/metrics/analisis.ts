// La aritmética de Analíticas (F12). Igual que `engagement.ts`: nada de DB ni
// de Nest, solo filas que alguien más ya leyó. El motor
// (`MetricsEngineService.analizar`) hace las lecturas y llama esto; los
// endpoints de Analíticas rebanan el resultado y no calculan nada.
//
// Las reglas de este archivo son el addendum F12 de ADR-022. Las que más
// cuestan de ver desde fuera:
//
//   - Un total es "lo que ves hoy": el último número que la red dio de cada
//     métrica. Una comparación es siempre a las 24 h de vida: si no, una
//     publicación de hace seis semanas le ganaría a una de ayer solo por haber
//     tenido más tiempo.
//   - "Tu promedio en esa red" sale de `valoresDeRed` + `promedioDe`, lo mismo
//     que usa Ritmo. Con la ventana de 30 días es el mismo número por
//     construcción, no por coincidencia.
//   - Nunca se mezclan redes en una tasa. Las interacciones sí se suman entre
//     redes (son conteos de lo mismo); el alcance solo entre las redes que lo
//     reportan, y se dice cuáles.

import type { EstadoPublicacion, MuestraDeRed, SocialNetwork } from "@presencia/shared";
import {
  EDAD_REFERENCIA_HORAS,
  N_MINIMO_GRUPO,
  baseDeRed,
  N_MINIMO_RED,
  interaccionesDe,
  promedioDe,
  valorDe,
  valoresDeRed,
  type BaseDeCalculo,
  type PostComparable,
} from "./engagement.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** La ventana mínima del promedio: la misma de Ritmo. */
export const VENTANA_REFERENCIA_MINIMA_DIAS = 30;

/**
 * Cuántas barras tiene la tendencia de "Por red", por periodo.
 *
 * Tramos iguales y no semanas de calendario: con 30 días, una semana partida
 * en la orilla tendría la mitad de publicaciones y dibujaría una caída que no
 * pasó.
 */
const TRAMOS_POR_PERIODO: Record<number, number> = { 7: 7, 30: 5, 90: 9 };

/** Una publicación de `publication_cards`, lo mínimo para medirla. */
export interface PublicacionMedible {
  cardId: string;
  network: SocialNetwork;
  /** Sin él no hay por quién preguntarle a la red: `sin_medicion`. */
  platformPostId: string | null;
  publishedAt: Date;
}

/**
 * El último número que la red dio de cada métrica, columna por columna.
 *
 * Por columna y no "el último snapshot": un bucket nuevo con `null` en
 * comentarios no borra el número que la red dio una hora antes. Es la misma
 * regla que el `coalesce` de la ingesta dentro de un bucket, llevada a lo
 * largo de la serie.
 */
export interface UltimosNumeros {
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** El `captured_at` más reciente, traiga o no números. */
  medidoEn: Date | null;
  /** Cuántos snapshots tiene. 0 = nunca se midió. */
  snapshots: number;
}

/** Lo que la red tiene de evidencia, dentro de la ventana de referencia. */
export interface ContextoDeRed {
  network: SocialNetwork;
  base: BaseDeCalculo;
  muestra: MuestraDeRed;
  /** Igual que `nTotal` de Ritmo. */
  nReferencia: number;
  /** Solo con `muestra = suficiente`. */
  promedio: number | null;
}

/** Los números de una publicación, ya con su estado. */
export interface NumerosDePublicacion {
  estado: EstadoPublicacion;
  ultimos: UltimosNumeros | null;
  interacciones: number | null;
  /** Su valor a las 24 h, en la base de su red. */
  a24h: number | null;
  /** Porcentaje entero sobre el promedio de su red. */
  lift: number | null;
}

export type PostAnalizado<P extends PublicacionMedible> = NumerosDePublicacion & {
  publicacion: P;
};

export interface EngagementDeRed {
  network: SocialNetwork;
  base: BaseDeCalculo;
  muestra: MuestraDeRed;
  valor: number | null;
  cambio: number | null;
}

export interface RedAnalizada {
  network: SocialNetwork;
  contexto: ContextoDeRed;
  engagement: EngagementDeRed;
  publicaciones: number;
  alcance: number | null;
  interacciones: number | null;
  tendencia: (number | null)[];
}

export interface KpisDelPeriodo {
  publicaciones: { total: number; cambio: number | null };
  alcance: { total: number | null; cambioPct: number | null; redes: SocialNetwork[] };
  interacciones: { total: number | null; cambioPct: number | null };
  engagement: EngagementDeRed[];
}

export interface Analisis<P extends PublicacionMedible> {
  periodoDias: number;
  ventanaReferenciaDias: number;
  /** Las publicaciones del periodo, de la más nueva a la más vieja. */
  posts: PostAnalizado<P>[];
  /** Una por red con publicaciones en el periodo. */
  redes: RedAnalizada[];
  /** Por red, de todas las que tienen algo en la ventana de referencia. */
  contextos: Map<SocialNetwork, ContextoDeRed>;
  /** La medición más reciente de lo que la ingesta sigue midiendo (≤ 30 días). */
  ultimaMedicion: Date | null;
}

export interface EntradaAnalisis<P extends PublicacionMedible> {
  ahora: Date;
  periodoDias: number;
  /** Las publicaciones de `[ahora − 2P, ahora]`: el periodo y el anterior. */
  publicaciones: readonly P[];
  /** Por `clave(network, platformPostId)`. */
  ultimos: ReadonlyMap<string, UltimosNumeros>;
  /** Los puntos de 24 h desde `desdeComparables(...)`. */
  comparables: readonly PostComparable[];
}

export function clave(network: SocialNetwork, platformPostId: string): string {
  return `${network}:${platformPostId}`;
}

export function ventanaReferenciaDias(periodoDias: number): number {
  return Math.max(periodoDias, VENTANA_REFERENCIA_MINIMA_DIAS);
}

/**
 * Desde dónde hay que leer publicaciones: el periodo y el anterior, y nunca
 * menos de 30 días, que es lo que la ingesta sigue midiendo. Sin ese piso, con
 * 7 días "Medido hace…" no vería una publicación de hace 20 que se midió hace
 * una hora.
 */
export function desdePublicaciones(ahora: Date, periodoDias: number): Date {
  const dias = Math.max(2 * periodoDias, VENTANA_REFERENCIA_MINIMA_DIAS);
  return new Date(ahora.getTime() - dias * DIA);
}

/**
 * Desde dónde hay que leer puntos de 24 h: lo que pida la ventana más vieja,
 * la de referencia o la del cambio anterior (corrida 24 h).
 */
export function desdeComparables(ahora: Date, periodoDias: number): Date {
  const referencia = ahora.getTime() - ventanaReferenciaDias(periodoDias) * DIA;
  const anterior = ahora.getTime() - (2 * periodoDias * DIA + EDAD_REFERENCIA_HORAS * HORA);
  return new Date(Math.min(referencia, anterior));
}

/**
 * La evidencia de cada red en la ventana de referencia.
 *
 * Los mismos pasos y en el mismo orden que `horariosCon` de Ritmo, para que
 * `muestra`/`nReferencia` digan lo mismo que su `modo`/`nTotal`. La única
 * diferencia es deliberada: Ritmo también cae a `poca` si ninguna franja
 * llega a 5, porque su "+%" es por franja; aquí el "+%" es por publicación y
 * solo necesita el promedio de la red.
 */
export function contextosDeRed(
  comparables: readonly PostComparable[],
  ahora: Date,
  periodoDias: number,
): Map<SocialNetwork, ContextoDeRed> {
  const desde = ahora.getTime() - ventanaReferenciaDias(periodoDias) * DIA;
  const porRed = new Map<SocialNetwork, PostComparable[]>();
  for (const post of comparables) {
    if (post.publishedAt.getTime() < desde) continue;
    const lista = porRed.get(post.network) ?? [];
    lista.push(post);
    porRed.set(post.network, lista);
  }

  const contextos = new Map<SocialNetwork, ContextoDeRed>();
  for (const [network, posts] of porRed) {
    const { base, valores } = valoresDeRed(posts);
    // Ningún valor = ninguna interacción reportada: con una sola, `baseDeRed`
    // ya habría dado al menos un valor (Ritmo: `conNumeros.length === 0`).
    if (valores.length === 0) {
      contextos.set(network, {
        network,
        base,
        muestra: "no_reporta",
        nReferencia: posts.length,
        promedio: null,
      });
      continue;
    }
    const promedio = promedioDe(valores.map((v) => v.valor));
    const suficiente = valores.length >= N_MINIMO_RED && promedio > 0;
    contextos.set(network, {
      network,
      base,
      muestra: suficiente ? "suficiente" : "poca",
      nReferencia: valores.length,
      promedio: suficiente ? promedio : null,
    });
  }
  return contextos;
}

/**
 * El contexto de una red sin nada en la ventana de referencia.
 *
 * Sin promedio, pero con base: la de los últimos números que sí hay (sus
 * publicaciones todavía no cumplen 24 h). Con `interacciones` fija, una cuenta
 * nueva de Instagram mostraría "45" hoy y "4.2%" mañana, sin que nada haya
 * cambiado más que la unidad.
 */
export function contextoVacio(
  network: SocialNetwork,
  conNumeros: readonly PostComparable[] = [],
): ContextoDeRed {
  return {
    network,
    base: baseDeRed(conNumeros),
    muestra: "sin_datos",
    nReferencia: 0,
    promedio: null,
  };
}

function tieneNumero(ultimos: UltimosNumeros): boolean {
  return [ultimos.reach, ultimos.impressions, ultimos.likes, ultimos.comments, ultimos.shares].some(
    (valor) => valor !== null,
  );
}

/** Los últimos números como si fueran un punto comparable (para `valorDe`). */
function comoComparable(publicacion: PublicacionMedible, ultimos: UltimosNumeros): PostComparable {
  return {
    network: publicacion.network,
    platformPostId: publicacion.platformPostId ?? "",
    publishedAt: publicacion.publishedAt,
    reach: ultimos.reach,
    likes: ultimos.likes,
    comments: ultimos.comments,
    shares: ultimos.shares,
  };
}

/**
 * El estado y los números de una publicación.
 *
 * El orden de las preguntas importa:
 *
 * 1. Sin id del post en la red, nadie puede preguntar por ella: `sin_medicion`.
 * 2. Un solo número, de cualquiera de las cinco métricas: `medida`.
 * 3. Si la red entera no reporta, `no_reporta` aunque tenga dos horas: decirle
 *    "en camino" a un LinkedIn personal es prometer algo que nunca llega.
 * 4. Con 24 h cumplidas: si la midieron y vino vacía, la red no reporta; si
 *    nunca se midió, Presencia no la pudo seguir.
 * 5. Lo demás es reciente: `en_camino`.
 */
export function numerosDe(
  publicacion: PublicacionMedible,
  ultimos: UltimosNumeros | undefined,
  comparable: PostComparable | undefined,
  contexto: ContextoDeRed,
  ahora: Date,
): NumerosDePublicacion {
  const edad = ahora.getTime() - publicacion.publishedAt.getTime();
  const cumplio24h = edad >= EDAD_REFERENCIA_HORAS * HORA;
  const medido = ultimos && ultimos.snapshots > 0 ? ultimos : null;

  let estado: EstadoPublicacion;
  if (!publicacion.platformPostId) estado = "sin_medicion";
  else if (medido && tieneNumero(medido)) estado = "medida";
  else if (contexto.muestra === "no_reporta") estado = "no_reporta";
  else if (cumplio24h) estado = medido ? "no_reporta" : "sin_medicion";
  else estado = "en_camino";

  const interacciones = medido ? interaccionesDe(comoComparable(publicacion, medido)) : null;
  const a24h = comparable ? valorDe(comparable, contexto.base) : null;
  const lift =
    a24h !== null && contexto.promedio !== null
      ? Math.round((a24h / contexto.promedio - 1) * 100)
      : null;

  return { estado, ultimos: medido, interacciones, a24h, lift };
}

/**
 * El análisis completo de un periodo: el único conjunto de datos del que
 * salen los endpoints de Analíticas.
 */
export function analizarPeriodo<P extends PublicacionMedible>(
  entrada: EntradaAnalisis<P>,
): Analisis<P> {
  const { ahora, periodoDias } = entrada;
  const desdePeriodo = ahora.getTime() - periodoDias * DIA;
  const contextos = contextosDeRed(entrada.comparables, ahora, periodoDias);
  const comparablePorClave = new Map(
    entrada.comparables.map((post) => [clave(post.network, post.platformPostId), post]),
  );

  const delPeriodo = entrada.publicaciones
    .filter((p) => p.publishedAt.getTime() >= desdePeriodo && p.publishedAt <= ahora)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  // Las redes del periodo que todavía no tienen nada con 24 h: su base sale
  // de los últimos números (ver `contextoVacio`).
  const ultimosDe = (publicacion: P) =>
    publicacion.platformPostId
      ? entrada.ultimos.get(clave(publicacion.network, publicacion.platformPostId))
      : undefined;
  for (const network of new Set(delPeriodo.map((p) => p.network))) {
    if (contextos.has(network)) continue;
    const conNumeros = delPeriodo.flatMap((publicacion) => {
      const numeros = publicacion.network === network ? ultimosDe(publicacion) : undefined;
      return numeros ? [comoComparable(publicacion, numeros)] : [];
    });
    contextos.set(network, contextoVacio(network, conNumeros));
  }

  const posts: PostAnalizado<P>[] = delPeriodo.map((publicacion) => {
    const llave = publicacion.platformPostId
      ? clave(publicacion.network, publicacion.platformPostId)
      : null;
    return {
      publicacion,
      ...numerosDe(
        publicacion,
        ultimosDe(publicacion),
        llave ? comparablePorClave.get(llave) : undefined,
        contextos.get(publicacion.network) ?? contextoVacio(publicacion.network),
        ahora,
      ),
    };
  });

  const redesDelPeriodo = [...new Set(posts.map((post) => post.publicacion.network))];
  const redes = redesDelPeriodo
    .map((network) =>
      redAnalizada(network, posts, entrada, contextos.get(network) ?? contextoVacio(network)),
    )
    .sort(porRelevancia);

  // Lo que la ingesta sigue midiendo: lo de 30 días o menos. Algo más viejo
  // ya no se mide (frescura.ts), y su última medición vieja no significa que
  // los datos estén atrasados.
  const desdeVivas = ahora.getTime() - VENTANA_REFERENCIA_MINIMA_DIAS * DIA;
  let ultimaMedicion: Date | null = null;
  for (const publicacion of entrada.publicaciones) {
    if (!publicacion.platformPostId || publicacion.publishedAt.getTime() < desdeVivas) continue;
    const medidoEn = entrada.ultimos.get(
      clave(publicacion.network, publicacion.platformPostId),
    )?.medidoEn;
    if (medidoEn && (!ultimaMedicion || medidoEn > ultimaMedicion)) ultimaMedicion = medidoEn;
  }

  return {
    periodoDias,
    ventanaReferenciaDias: ventanaReferenciaDias(periodoDias),
    posts,
    redes,
    contextos,
    ultimaMedicion,
  };
}

/** Las dos ventanas del cambio, corridas 24 h para que todo haya cumplido su edad. */
function ventanasDelCambio(ahora: Date, periodoDias: number) {
  const fin = ahora.getTime() - EDAD_REFERENCIA_HORAS * HORA;
  const largo = periodoDias * DIA;
  return {
    actual: { desde: fin - largo, hasta: fin },
    anterior: { desde: fin - 2 * largo, hasta: fin - largo },
  };
}

function dentro(post: PostComparable, ventana: { desde: number; hasta: number }): boolean {
  const t = post.publishedAt.getTime();
  return t >= ventana.desde && t < ventana.hasta;
}

/**
 * El cambio porcentual de una suma a 24 h, o `null` si alguna de las dos
 * ventanas no llega a 5 publicaciones con ese número: con dos posts por
 * semana, "+300%" es ruido con cara de dato.
 */
function cambioPctDeSuma(
  comparables: readonly PostComparable[],
  ahora: Date,
  periodoDias: number,
  valor: (post: PostComparable) => number | null,
): number | null {
  const { actual, anterior } = ventanasDelCambio(ahora, periodoDias);
  const sumar = (ventana: { desde: number; hasta: number }) => {
    const valores = comparables
      .filter((post) => dentro(post, ventana))
      .map(valor)
      .filter((v): v is number => v !== null);
    return { n: valores.length, suma: valores.reduce((s, v) => s + v, 0) };
  };
  const a = sumar(actual);
  const b = sumar(anterior);
  if (a.n < N_MINIMO_GRUPO || b.n < N_MINIMO_GRUPO || b.suma <= 0) return null;
  return Math.round((a.suma / b.suma - 1) * 100);
}

/** El cambio del engagement de una red: diferencia de promedios a 24 h. */
function cambioDeEngagement(
  comparables: readonly PostComparable[],
  contexto: ContextoDeRed,
  ahora: Date,
  periodoDias: number,
): number | null {
  if (contexto.muestra === "no_reporta" || contexto.muestra === "sin_datos") return null;
  const { actual, anterior } = ventanasDelCambio(ahora, periodoDias);
  const promedioEn = (ventana: { desde: number; hasta: number }) => {
    const valores = comparables
      .filter((post) => post.network === contexto.network && dentro(post, ventana))
      .map((post) => valorDe(post, contexto.base))
      .filter((v): v is number => v !== null);
    return valores.length >= N_MINIMO_GRUPO ? promedioDe(valores) : null;
  };
  const a = promedioEn(actual);
  const b = promedioEn(anterior);
  return a === null || b === null ? null : a - b;
}

/** El engagement de hoy: promedio por publicación de sus últimos números. */
function engagementDe<P extends PublicacionMedible>(
  posts: readonly PostAnalizado<P>[],
  contexto: ContextoDeRed,
  entrada: EntradaAnalisis<P>,
): EngagementDeRed {
  const valores = posts.flatMap((post) => {
    if (!post.ultimos) return [];
    const valor = valorDe(comoComparable(post.publicacion, post.ultimos), contexto.base);
    return valor === null ? [] : [valor];
  });
  // Sin compuerta por `muestra`: si la red no reporta, `valorDe` ya da null en
  // cada publicación. Y si sus puntos de 24 h vinieron vacíos pero los de
  // después no (un proveedor que falló un rato), el número de hoy existe y la
  // tabla ya lo muestra como "medida": callarlo aquí contradiría a la tabla.
  return {
    network: contexto.network,
    base: contexto.base,
    muestra: contexto.muestra,
    valor: valores.length > 0 ? promedioDe(valores) : null,
    cambio: cambioDeEngagement(entrada.comparables, contexto, entrada.ahora, entrada.periodoDias),
  };
}

function sumaONull(valores: readonly (number | null)[]): number | null {
  const conNumero = valores.filter((v): v is number => v !== null);
  return conNumero.length === 0 ? null : conNumero.reduce((s, v) => s + v, 0);
}

function redAnalizada<P extends PublicacionMedible>(
  network: SocialNetwork,
  todos: readonly PostAnalizado<P>[],
  entrada: EntradaAnalisis<P>,
  contexto: ContextoDeRed,
): RedAnalizada {
  const posts = todos.filter((post) => post.publicacion.network === network);
  return {
    network,
    contexto,
    engagement: engagementDe(posts, contexto, entrada),
    publicaciones: posts.length,
    alcance: sumaONull(posts.map((post) => post.ultimos?.reach ?? null)),
    interacciones: sumaONull(posts.map((post) => post.interacciones)),
    tendencia: tendenciaDe(posts, contexto, entrada.ahora, entrada.periodoDias),
  };
}

/**
 * El orden de las redes en todo Analíticas: primero donde más publicaste, y al
 * final las que no reportan (no hay número que leer). Lo pone el motor y no la
 * pantalla porque la lista de engagement del resumen y la lente "Por red" son
 * la misma lista: ordenadas en dos lugares, se desincronizan. Empate: por
 * nombre, para que no dependa del orden de lectura.
 */
function porRelevancia(a: RedAnalizada, b: RedAnalizada): number {
  const noReportaA = a.contexto.muestra === "no_reporta" ? 1 : 0;
  const noReportaB = b.contexto.muestra === "no_reporta" ? 1 : 0;
  return (
    noReportaA - noReportaB ||
    b.publicaciones - a.publicaciones ||
    a.network.localeCompare(b.network)
  );
}

/** El engagement de hoy por tramos iguales del periodo, del más viejo al más nuevo. */
function tendenciaDe<P extends PublicacionMedible>(
  posts: readonly PostAnalizado<P>[],
  contexto: ContextoDeRed,
  ahora: Date,
  periodoDias: number,
): (number | null)[] {
  const tramos = TRAMOS_POR_PERIODO[periodoDias] ?? periodoDias;
  const ancho = (periodoDias * DIA) / tramos;
  const inicio = ahora.getTime() - periodoDias * DIA;
  const valores: number[][] = Array.from({ length: tramos }, () => []);
  for (const post of posts) {
    if (!post.ultimos) continue;
    const valor = valorDe(comoComparable(post.publicacion, post.ultimos), contexto.base);
    if (valor === null) continue;
    const indice = Math.min(
      tramos - 1,
      Math.floor((post.publicacion.publishedAt.getTime() - inicio) / ancho),
    );
    valores[indice]?.push(valor);
  }
  return valores.map((tramo) => (tramo.length === 0 ? null : promedioDe(tramo)));
}

/**
 * Los cuatro números de arriba, para todas las redes o para una.
 *
 * Una rebanada del mismo `Analisis`: el filtro de red no vuelve a leer nada.
 */
export function kpisDe<P extends PublicacionMedible>(
  analisis: Analisis<P>,
  entrada: Pick<EntradaAnalisis<P>, "ahora" | "periodoDias" | "publicaciones" | "comparables">,
  red: SocialNetwork | null,
): KpisDelPeriodo {
  const { ahora, periodoDias } = entrada;
  const enAlcance = (network: SocialNetwork) => red === null || network === red;
  const posts = analisis.posts.filter((post) => enAlcance(post.publicacion.network));
  const redes = analisis.redes.filter((r) => enAlcance(r.network));

  const desdePeriodo = ahora.getTime() - periodoDias * DIA;
  const desdeAnterior = desdePeriodo - periodoDias * DIA;
  const anteriores = entrada.publicaciones.filter((p) => {
    const t = p.publishedAt.getTime();
    return enAlcance(p.network) && t >= desdeAnterior && t < desdePeriodo;
  }).length;

  // Alcance: solo las redes que lo reportan en el periodo.
  const redesConAlcance = redes.filter((r) => r.alcance !== null).map((r) => r.network);
  const conAlcance = new Set(redesConAlcance);
  const comparables = entrada.comparables.filter((post) => enAlcance(post.network));

  return {
    publicaciones: {
      total: posts.length,
      cambio: anteriores === 0 ? null : posts.length - anteriores,
    },
    alcance: {
      total: sumaONull(redes.map((r) => r.alcance)),
      cambioPct:
        conAlcance.size === 0
          ? null
          : cambioPctDeSuma(
              comparables.filter((post) => conAlcance.has(post.network)),
              ahora,
              periodoDias,
              (post) => post.reach,
            ),
      redes: redesConAlcance,
    },
    interacciones: {
      total: sumaONull(posts.map((post) => post.interacciones)),
      cambioPct: cambioPctDeSuma(comparables, ahora, periodoDias, interaccionesDe),
    },
    engagement: redes.map((r) => r.engagement),
  };
}
