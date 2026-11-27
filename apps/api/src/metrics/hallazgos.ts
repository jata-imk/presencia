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

import type {
  AnaliticasHallazgoDto,
  CorteDeDia,
  DiaDeLaSemana,
  FormatoPublicado,
  PublicationArchetype,
  SocialNetwork,
} from "@presencia/shared";
import { FORMATOS_PUBLICADOS, cardContentSchema } from "@presencia/shared";
import type { ContextoDeRed, PostAnalizado, PublicacionMedible } from "./analisis.js";
import { N_MINIMO_GRUPO, promedioDe } from "./engagement.js";
import { fechaLocal } from "./hora-local.js";

/** Cuánto más tiene que rendir el ganador: 25%. */
export const DIFERENCIA_MINIMA = 0.25;

/** Cuántos hallazgos muestra la sección. */
export const MAXIMO_HALLAZGOS = 3;

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

interface Punto {
  valor: number;
  formato: FormatoPublicado | null;
  dia: DiaDeLaSemana;
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
): AnaliticasHallazgoDto | null {
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

function hallazgoDeDia(
  network: SocialNetwork,
  puntos: readonly Punto[],
): AnaliticasHallazgoDto | null {
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

export interface ResultadoHallazgos {
  /** Alguna red en alcance tiene muestra (≥ 10) para buscar. */
  hayMuestra: boolean;
  /** Como máximo uno por (tipo, red); de mayor a menor diferencia, hasta 3. */
  hallazgos: AnaliticasHallazgoDto[];
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
): ResultadoHallazgos {
  const redes = [...contextos.values()]
    .filter((c) => c.muestra === "suficiente" && (red === null || c.network === red))
    .map((c) => c.network)
    .sort();

  const hallazgos = redes.flatMap((network) => {
    const puntos: Punto[] = posts.flatMap((post) => {
      if (post.publicacion.network !== network || post.a24h === null) return [];
      return [
        {
          valor: post.a24h,
          formato: formatoPublicado(post.publicacion.archetype, post.publicacion.content),
          dia: fechaLocal(post.publicacion.publishedAt, timezone).diaSemana as DiaDeLaSemana,
        },
      ];
    });
    return [hallazgoDeFormato(network, puntos), hallazgoDeDia(network, puntos)].filter(
      (h): h is AnaliticasHallazgoDto => h !== null,
    );
  });

  return {
    hayMuestra: redes.length > 0,
    // `sort` es estable: en un empate queda el orden de arriba (red por
    // nombre, formato antes que día).
    hallazgos: hallazgos
      .sort((a, b) => b.diferenciaPct - a.diferenciaPct)
      .slice(0, MAXIMO_HALLAZGOS),
  };
}
