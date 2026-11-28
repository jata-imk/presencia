// Los hallazgos de Analíticas (F12, lore doc §5). Puro, como `analisis.ts`:
// recibe las publicaciones ya analizadas (con su valor a 24 h) y devuelve
// conclusiones. El servicio no decide nada.
//
// Un hallazgo es una diferencia en TUS publicaciones, dentro de UNA red, que
// aguanta tres pruebas (`compararGrupos`):
//
//   1. Muestra: ≥ 5 en cada grupo y ≥ 10 en la red (`muestra = suficiente`,
//      el mismo umbral de Ritmo y del "sobre tu promedio").
//   2. Tamaño: el grupo ganador rindió al menos 25% más.
//   3. No es un golpe de suerte: sin la mejor publicación del ganador ni la
//      peor del perdedor, la diferencia sigue siendo de 25% o más. Un viral
//      (o un post roto) no es un patrón.
//
// Un hallazgo falso es peor que ninguno (el creator cambia su contenido por un
// ruido), así que los cortes son pocos y fijos. Buscar "los días buenos" y
// juntarlos encontraría siempre una diferencia, aunque fuera azar; por eso el
// día se compara solo de ocho maneras (cada día contra el resto, y fin de
// semana contra entre semana), decidido con Jose en el PR 8.
//
// El tercer tipo (PR 9) es un rasgo del texto publicado: con y sin emojis,
// hashtags o signos de exclamación, abre con pregunta o no, y corto contra
// largo partido en la mediana de la red. Los dos lados de cada uno, con las
// mismas tres pruebas. El motor no conoce la voz: dice qué lado ganó, y el
// servicio le pone la propuesta para «Así escribes».

import type {
  CorteDeDia,
  DiaDeLaSemana,
  FormatoPublicado,
  HallazgoDiaDto,
  HallazgoFormatoDto,
  HallazgoVozDto,
  PublicationArchetype,
  SocialNetwork,
  TextoDePublicacion,
} from "@presencia/shared";
import {
  DIRECCIONES_DE_RASGO,
  FORMATOS_PUBLICADOS,
  RASGOS_DE_TEXTO,
  cardContentSchema,
  corteDeLargo,
  idDeHallazgoDeVoz,
  textoPublicado,
  tieneRasgo,
} from "@presencia/shared";
import type { ContextoDeRed, PostAnalizado, PublicacionMedible } from "./analisis.js";
import { N_MINIMO_GRUPO, promedioDe } from "./engagement.js";
import { fechaLocal } from "./hora-local.js";

/** Cuánto más tiene que rendir el ganador: 25%. */
export const DIFERENCIA_MINIMA = 0.25;

/** Cuántos hallazgos muestra la sección. */
export const MAXIMO_HALLAZGOS = 3;

/**
 * Después de un "No" a un hallazgo de voz, cuántas publicaciones medidas
 * nuevas (de esa red, publicadas después del "No") hacen que vuelva a
 * preguntar, si se sigue sosteniendo con la ventana completa. Con menos, es la
 * misma evidencia que ya dijo que no. Decidido con Jose en el PR 9.
 */
export const NUEVAS_PARA_VOLVER = 5;

/** Sábado y domingo, con 0 = lunes. */
const FIN_DE_SEMANA: readonly DiaDeLaSemana[] = [5, 6];

/**
 * El formato de lo que se publicó. Dentro de una red el arquetipo no cambia
 * (Instagram siempre es `visual_first`), así que comparar arquetipos no diría
 * nada; lo que sí cambia es si llevó carrusel, una imagen o ninguna.
 *
 * `null` si el contenido no se puede leer: meterlo en `texto` inventaría una
 * publicación sin imagen que a lo mejor sí la tuvo.
 */
export function formatoPublicado(
  archetype: PublicationArchetype,
  content: unknown,
): FormatoPublicado | null {
  if (archetype === "video_script") return "video";
  const parsed = cardContentSchema.safeParse(content);
  if (!parsed.success || parsed.data.archetype === "video_script") return null;
  // Por imágenes y no por slides: un slide puede no tener imagen, y lo que se
  // publica son las imágenes (`assetIds` son las de los slides). Un "carrusel"
  // con una sola imagen salió como imagen suelta.
  const imagenes = parsed.data.assetIds.length;
  if (parsed.data.slides && imagenes >= 2) return "carrusel";
  if (imagenes > 0) return "imagen";
  return "texto";
}

export interface Comparacion {
  diferenciaPct: number;
  nGanador: number;
  nPerdedor: number;
}

/**
 * ¿El primer grupo rindió de verdad más que el segundo? Los valores están en
 * la base de la red (tasa o interacciones a 24 h), nunca mezclando redes.
 *
 * Solo prueba esa dirección: quien llama decide qué grupo nombra. La muestra
 * (≥ 5) se cuenta antes de quitar nada, y la prueba del viral deja cada grupo
 * en cuatro a propósito: lo que se pregunta es si la diferencia dependía de
 * una sola publicación.
 *
 * Esa prueba mira los dos lados a la vez: sin la mejor del ganador Y sin la
 * peor del perdedor. Un viral infla al ganador, pero un post roto (alcance 0,
 * una publicación que salió mal) hunde al perdedor igual de solo, y con cinco
 * por grupo cualquiera de los dos basta para fabricar un 25%.
 */
export function compararGrupos(
  ganador: readonly number[],
  perdedor: readonly number[],
): Comparacion | null {
  if (ganador.length < N_MINIMO_GRUPO || perdedor.length < N_MINIMO_GRUPO) return null;
  const referencia = promedioDe(perdedor);
  // Sin interacción en el perdedor no hay "N% más" que decir: sería infinito.
  if (referencia <= 0) return null;
  const diferencia = promedioDe(ganador) / referencia - 1;
  if (diferencia < DIFERENCIA_MINIMA) return null;

  const sinLaMejor = [...ganador].sort((a, b) => b - a).slice(1);
  const sinLaPeor = [...perdedor].sort((a, b) => a - b).slice(1);
  if (promedioDe(sinLaMejor) / promedioDe(sinLaPeor) - 1 < DIFERENCIA_MINIMA) return null;

  return {
    diferenciaPct: Math.round(diferencia * 100),
    nGanador: ganador.length,
    nPerdedor: perdedor.length,
  };
}

/** Lo que necesita un post para entrar a los hallazgos. */
export interface PublicacionConFormato extends PublicacionMedible {
  archetype: PublicationArchetype;
  content: unknown;
}

/**
 * Un hallazgo tal como sale del motor. El de voz todavía sin su propuesta:
 * la pone el servicio, que es quien lee la voz.
 */
export type HallazgoVozDelMotor = Omit<HallazgoVozDto, "propuesta">;
export type HallazgoDelMotor = HallazgoFormatoDto | HallazgoDiaDto | HallazgoVozDelMotor;

/** Llave de la decisión (`m-emojis-sin-instagram`) → cuándo dijo "No". */
export type DescartesDeVoz = ReadonlyMap<string, Date>;

interface Punto {
  valor: number;
  formato: FormatoPublicado | null;
  dia: DiaDeLaSemana;
  /** El texto que se leyó en la red; `null` si el contenido no se pudo leer. */
  texto: TextoDePublicacion | null;
  publishedAt: Date;
}

function mayor<T extends { diferenciaPct: number }>(candidatos: readonly T[]): T | null {
  // `reduce` conserva el primero en un empate: el orden de los candidatos ya
  // es determinista (FORMATOS_PUBLICADOS, lunes a domingo).
  return candidatos.reduce<T | null>(
    (mejor, c) => (mejor === null || c.diferenciaPct > mejor.diferenciaPct ? c : mejor),
    null,
  );
}

function hallazgoDeFormato(
  network: SocialNetwork,
  puntos: readonly Punto[],
): HallazgoDelMotor | null {
  const valoresDe = (formato: FormatoPublicado) =>
    puntos.filter((p) => p.formato === formato).map((p) => p.valor);
  const candidatos = FORMATOS_PUBLICADOS.flatMap((ganador) =>
    FORMATOS_PUBLICADOS.flatMap((perdedor) => {
      if (ganador === perdedor) return [];
      const comparacion = compararGrupos(valoresDe(ganador), valoresDe(perdedor));
      return comparacion
        ? [{ tipo: "formato" as const, network, ganador, perdedor, ...comparacion }]
        : [];
    }),
  );
  return mayor(candidatos);
}

function hallazgoDeDia(network: SocialNetwork, puntos: readonly Punto[]): HallazgoDelMotor | null {
  const partir = (enGrupo: (dia: DiaDeLaSemana) => boolean) => ({
    dentro: puntos.filter((p) => enGrupo(p.dia)).map((p) => p.valor),
    fuera: puntos.filter((p) => !enGrupo(p.dia)).map((p) => p.valor),
  });

  // Solo los cortes donde el grupo nombrado es el que ganó: "tus publicaciones
  // de martes tuvieron 31% más". El día flojo ("el domingo rinde menos") no
  // se dice por separado: es la otra cara de "entre semana".
  const cortes: { ganador: CorteDeDia; ganadores: number[]; resto: number[] }[] = [];
  for (let dia = 0; dia < 7; dia += 1) {
    const { dentro, fuera } = partir((d) => d === dia);
    cortes.push({ ganador: { dia: dia as DiaDeLaSemana }, ganadores: dentro, resto: fuera });
  }
  const finDeSemana = partir((d) => FIN_DE_SEMANA.includes(d));
  cortes.push({
    ganador: "fin_de_semana",
    ganadores: finDeSemana.dentro,
    resto: finDeSemana.fuera,
  });
  cortes.push({
    ganador: "entre_semana",
    ganadores: finDeSemana.fuera,
    resto: finDeSemana.dentro,
  });

  const candidatos = cortes.flatMap(({ ganador, ganadores, resto }) => {
    const comparacion = compararGrupos(ganadores, resto);
    return comparacion ? [{ tipo: "dia" as const, network, ganador, ...comparacion }] : [];
  });
  return mayor(candidatos);
}

/**
 * Todos los rasgos que aguantan las tres pruebas en una red, de mayor a menor
 * diferencia. En cada rasgo gana a lo más un lado: con 25% de ventaja, el
 * otro no puede tenerla también.
 *
 * Un hallazgo al que el creator dijo "No" se calla hasta que haya
 * `NUEVAS_PARA_VOLVER` publicaciones medidas nuevas en la red; mientras, su
 * lugar lo toma el siguiente rasgo.
 */
function candidatosDeVoz(
  network: SocialNetwork,
  puntos: readonly Punto[],
  descartes: DescartesDeVoz,
): HallazgoVozDelMotor[] {
  const conTexto = puntos.filter(
    (p): p is Punto & { texto: TextoDePublicacion } => p.texto !== null,
  );
  const corte = corteDeLargo(conTexto.map((p) => p.texto));
  const callado = (id: string) => {
    const dijoNo = descartes.get(id);
    if (dijoNo === undefined) return false;
    const nuevas = puntos.filter((p) => p.publishedAt.getTime() > dijoNo.getTime()).length;
    return nuevas < NUEVAS_PARA_VOLVER;
  };

  const candidatos = RASGOS_DE_TEXTO.flatMap((rasgo) => {
    const con = conTexto.filter((p) => tieneRasgo(rasgo, p.texto, corte)).map((p) => p.valor);
    const sin = conTexto.filter((p) => !tieneRasgo(rasgo, p.texto, corte)).map((p) => p.valor);
    return DIRECCIONES_DE_RASGO.flatMap((ganador) => {
      if (callado(idDeHallazgoDeVoz(rasgo, ganador, network))) return [];
      const comparacion = ganador === "con" ? compararGrupos(con, sin) : compararGrupos(sin, con);
      return comparacion
        ? [
            {
              tipo: "voz" as const,
              network,
              rasgo,
              ganador,
              corte: rasgo === "largo" ? corte : null,
              ...comparacion,
            },
          ]
        : [];
    });
  });
  // Estable: en un empate queda el orden de RASGOS_DE_TEXTO.
  return candidatos.sort((a, b) => b.diferenciaPct - a.diferenciaPct);
}

export interface ResultadoHallazgos {
  /** Alguna red en alcance tiene muestra (≥ 10) para buscar. */
  hayMuestra: boolean;
  /** Como máximo uno por (tipo, red); de mayor a menor diferencia, hasta 3. */
  hallazgos: HallazgoDelMotor[];
}

/** Las redes con muestra (≥ 10) dentro del alcance, por nombre. */
function redesConMuestra(
  contextos: ReadonlyMap<SocialNetwork, ContextoDeRed>,
  red: SocialNetwork | null,
): SocialNetwork[] {
  return [...contextos.values()]
    .filter((c) => c.muestra === "suficiente" && (red === null || c.network === red))
    .map((c) => c.network)
    .sort();
}

function puntosDe<P extends PublicacionConFormato>(
  posts: readonly PostAnalizado<P>[],
  network: SocialNetwork,
  timezone: string,
): Punto[] {
  return posts.flatMap((post) => {
    if (post.publicacion.network !== network || post.a24h === null) return [];
    return [
      {
        valor: post.a24h,
        formato: formatoPublicado(post.publicacion.archetype, post.publicacion.content),
        dia: fechaLocal(post.publicacion.publishedAt, timezone).diaSemana as DiaDeLaSemana,
        texto: textoPublicado(post.publicacion.content),
        publishedAt: post.publicacion.publishedAt,
      },
    ];
  });
}

/**
 * Los hallazgos de una ventana ya analizada.
 *
 * Quien llama pasa el análisis de 90 días (`analizar(tx, 90)`): con ese
 * periodo, `posts` son los de 90 días y `contextos` cuentan la muestra en
 * esa misma ventana (`ventanaReferenciaDias(90) = 90`). Los valores son los
 * `a24h` de cada post, ya en la base de su red: todo se compara a la misma
 * edad, para que la edad no decida.
 *
 * El día de la semana es el del creator (`timezone`), no el de UTC: un post a
 * las 19:00 en Mérida es lunes aunque en UTC ya sea martes.
 */
export function hallazgosDe<P extends PublicacionConFormato>(
  posts: readonly PostAnalizado<P>[],
  contextos: ReadonlyMap<SocialNetwork, ContextoDeRed>,
  timezone: string,
  red: SocialNetwork | null,
  descartes: DescartesDeVoz = new Map(),
): ResultadoHallazgos {
  const redes = redesConMuestra(contextos, red);

  const hallazgos = redes.flatMap((network) => {
    const puntos = puntosDe(posts, network, timezone);
    return [
      hallazgoDeFormato(network, puntos),
      hallazgoDeDia(network, puntos),
      candidatosDeVoz(network, puntos, descartes)[0] ?? null,
    ].filter((h): h is HallazgoDelMotor => h !== null);
  });

  return {
    hayMuestra: redes.length > 0,
    // `sort` es estable: en un empate queda el orden de arriba (red por
    // nombre; formato, día y voz).
    hallazgos: hallazgos
      .sort((a, b) => b.diferenciaPct - a.diferenciaPct)
      .slice(0, MAXIMO_HALLAZGOS),
  };
}

/** Cuántos rasgos por red lista Configuración › Voz de marca. */
export const MAXIMO_VOZ_POR_RED = 3;

/**
 * Los hallazgos de voz para Configuración › Voz de marca: sin el tope de 3 de
 * la sección (ahí compiten con formato y día) y hasta `MAXIMO_VOZ_POR_RED`
 * por red, porque cada uno es una propuesta distinta para «Así escribes».
 * Mismas pruebas y mismos descartes que `hallazgosDe`.
 */
export function hallazgosDeVoz<P extends PublicacionConFormato>(
  posts: readonly PostAnalizado<P>[],
  contextos: ReadonlyMap<SocialNetwork, ContextoDeRed>,
  timezone: string,
  descartes: DescartesDeVoz = new Map(),
): HallazgoVozDelMotor[] {
  return redesConMuestra(contextos, null).flatMap((network) =>
    candidatosDeVoz(network, puntosDe(posts, network, timezone), descartes).slice(
      0,
      MAXIMO_VOZ_POR_RED,
    ),
  );
}
