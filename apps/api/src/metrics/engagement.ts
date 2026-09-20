// La fórmula. Un solo lugar, y por eso este archivo no importa nada de la DB
// ni de Nest: es aritmética sobre filas que alguien más ya leyó.
//
// Vive acá y no dentro de Ritmo por una decisión de producto (ADR-022):
// Analíticas muestra la evidencia, Ritmo muestra la decisión, y las dos
// hablan del mismo número. Si cada módulo calculara su propio promedio, un
// día Ritmo diría "+18%" y Analíticas "+12%" para exactamente lo mismo, y
// ninguno de los dos estaría mal.
//
// Las tres reglas duras salen de ADR-021 y son las que hacen que el número
// signifique algo:
//
//   1. NULL no es 0. Un post que la red no reportó no entra; no vale cero.
//   2. Una sola base por red. Tasas y conteos absolutos nunca se promedian
//      juntos.
//   3. Misma edad. Dos posts solo son comparables medidos al mismo tiempo de
//      vida.

import type { SocialNetwork } from "@presencia/shared";

/**
 * Edad a la que se compara un post con otro.
 *
 * 24 h y no "su último snapshot" porque el último snapshot de un post de ayer
 * y el de uno de hace tres semanas miden cosas distintas: el segundo tuvo
 * veinte días más para acumular. Comparar esos dos números diría que publicar
 * hace tres semanas fue mejor idea, que es una conclusión sobre el calendario,
 * no sobre el horario.
 */
export const EDAD_REFERENCIA_HORAS = 24;

/**
 * Cuánto se acepta desviarse de esa edad al elegir el snapshot.
 *
 * 6 h porque ese es el ancho del bucket en el tramo de 12–48 h (frescura.ts):
 * es la resolución máxima que la ingesta puede dar ahí, así que pedir menos
 * dejaría posts fuera sin ganar precisión.
 */
export const TOLERANCIA_HORAS = 6;

/** Publicaciones mínimas en un grupo para publicar su "+%". */
export const N_MINIMO_GRUPO = 5;

/**
 * Publicaciones mínimas del usuario en esa red para que el promedio general
 * —el denominador del "+%"— signifique algo. Sin esto, un usuario con 5 posts
 * todos a la misma hora tendría un grupo que pasa el umbral y un promedio
 * general que es ese mismo grupo: "+0%" con cara de dato.
 */
export const N_MINIMO_RED = 10;

/**
 * Franjas de 3 h, las ocho que cubren el día completo.
 *
 * El diseño dibuja seis (de 6:00 a 24:00) porque son las horas en las que la
 * gente publica, pero el motor no puede tener un hueco: un post de las 3 de la
 * mañana existe, y si no cayera en ninguna franja desaparecería del heatmap
 * mientras seguiría contando en el promedio general. Eso haría que las celdas
 * visibles se comparen contra un denominador que incluye algo que no se ve.
 */
export const FRANJAS = [
  { id: "madrugada", desde: 0, hasta: 3, etiqueta: "0–3", nombre: "Madrugada" },
  { id: "amanecer", desde: 3, hasta: 6, etiqueta: "3–6", nombre: "Antes del amanecer" },
  { id: "temprano", desde: 6, hasta: 9, etiqueta: "6–9", nombre: "Mañana temprano" },
  { id: "manana", desde: 9, hasta: 12, etiqueta: "9–12", nombre: "Mañana" },
  { id: "mediodia", desde: 12, hasta: 15, etiqueta: "12–15", nombre: "Mediodía" },
  { id: "tarde", desde: 15, hasta: 18, etiqueta: "15–18", nombre: "Tarde" },
  { id: "noche", desde: 18, hasta: 21, etiqueta: "18–21", nombre: "Noche" },
  { id: "trasnoche", desde: 21, hasta: 24, etiqueta: "21–24", nombre: "Tarde-noche" },
] as const;

/** Índice de la franja de una hora local (0–23). */
export function franjaDe(horaLocal: number): number {
  return Math.floor(horaLocal / 3);
}

/**
 * Cómo se mide el engagement de una red en una ventana.
 *
 * `tasa` = interacciones / reach. Es lo correcto cuando existe, porque un post
 * con 10 likes de 100 personas alcanzadas rindió mejor que uno con 20 de 1000.
 * `interacciones` = el conteo pelón, para las redes que no reportan alcance.
 */
export type BaseDeCalculo = "tasa" | "interacciones";

/** Un post ya reducido a su punto comparable (el snapshot de ~24 h de edad). */
export interface PostComparable {
  network: SocialNetwork;
  platformPostId: string;
  publishedAt: Date;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/**
 * Interacciones del post, o `null` si la red no reportó ninguna de las tres.
 *
 * La suma ignora los `null` individuales en vez de anular todo el post:
 * Facebook puede dar likes y shares pero no comments, y descartarlo entero
 * perdería datos reales. Lo que no se hace nunca es convertir esos `null` en 0.
 *
 * **Limitación conocida:** dos posts con distinta cobertura de campos se
 * promedian como si fueran comparables, y el que reporta menos campos suma
 * menos por construcción. Dentro de una misma red el sesgo es parejo (la
 * cobertura la fija la plataforma, no el post), que es el único ámbito en el
 * que este número se usa. Si alguna vez varía post a post dentro de una red,
 * acá es donde hay que dejar de sumar peras con manzanas.
 */
export function interaccionesDe(post: PostComparable): number | null {
  const campos = [post.likes, post.comments, post.shares].filter(
    (valor): valor is number => valor !== null,
  );
  if (campos.length === 0) return null;
  return campos.reduce((suma, valor) => suma + valor, 0);
}

/**
 * Qué base usar para una red, mirando los posts que sí tienen datos.
 *
 * Es todo-o-nada a propósito. Si la mitad de los posts trajera `reach` y la
 * otra mitad no, promediar tasas con conteos daría un número sin unidad; y
 * quedarse solo con los que tienen `reach` cambiaría la muestra según la hora
 * (justo la dimensión que estamos midiendo). Con una sola base, el número es
 * comparable dentro de la red aunque no lo sea entre redes — que es exactamente
 * el alcance que el "+%" necesita.
 */
export function baseDeRed(posts: readonly PostComparable[]): BaseDeCalculo {
  const conDatos = posts.filter((post) => interaccionesDe(post) !== null);
  if (conDatos.length === 0) return "interacciones";
  const todosTienenReach = conDatos.every((post) => post.reach !== null && post.reach > 0);
  return todosTienenReach ? "tasa" : "interacciones";
}

/** El valor que entra a los promedios, o `null` si este post no aporta. */
export function valorDe(post: PostComparable, base: BaseDeCalculo): number | null {
  const interacciones = interaccionesDe(post);
  if (interacciones === null) return null;
  if (base === "interacciones") return interacciones;
  // `baseDeRed` ya garantizó que acá reach existe y no es 0, pero la guardia se
  // queda: esta función es pública y alguien puede llamarla con otra base.
  if (post.reach === null || post.reach <= 0) return null;
  return interacciones / post.reach;
}

/** Un post ya ubicado en el calendario local del usuario. */
export interface PostUbicado {
  /** 0 = lunes, 6 = domingo. En la zona horaria del usuario, no en UTC. */
  diaSemana: number;
  /** Índice en FRANJAS. */
  franja: number;
  valor: number;
}

export interface CeldaHorario {
  diaSemana: number;
  franja: number;
  n: number;
  /**
   * 1–4 para pintar el heatmap, y `0` cuando la celda no afirma nada: o nadie
   * publicó ahí, o ni ella ni su franja alcanzan el umbral. `0` nunca
   * significa "rindió mal" — eso es el tono 1.
   */
  intensidad: number;
  /** Porcentaje entero contra el promedio del usuario en esa red. */
  lift: number | null;
  /** El lift salió del promedio de la franja completa, no de esta celda. */
  heredado: boolean;
}

/**
 * `no_reporta` no lo produce `calcularHorarios` — lo decide el servicio, que
 * es quien puede distinguir "no publicaste" de "publicaste y la red no da
 * números". Vive en esta unión igual para que el tipo describa los cuatro
 * estados que la UI tiene que saber pintar, no tres de ellos.
 */
export type ModoHorarios = "cold" | "poca" | "full" | "no_reporta";

export interface ResultadoHorarios {
  modo: ModoHorarios;
  base: BaseDeCalculo;
  nTotal: number;
  celdas: CeldaHorario[];
}

/**
 * Los mejores horarios, con granularidad adaptativa.
 *
 * El heatmap del diseño es de 7 días × 8 franjas = 56 celdas. Pedirle N≥5 a
 * cada una exige 280 publicaciones en la ventana; a dos posts diarios son
 * cuatro meses y medio para que aparezca el primer número, y la ventana es de
 * 30 días, así que en realidad no aparecería nunca. El "+%" que el DoD promete
 * "pasado el umbral" sería inalcanzable por aritmética, no por diseño.
 *
 * La salida: se calcula primero por franja (8 grupos, que sí alcanzan N), y
 * luego por día×franja donde haya muestra. La celda fina que no llega hereda
 * el lift de su franja y queda marcada como `heredado` — la UI dice de dónde
 * salió el número en el tooltip. Así el usuario ve algo verdadero pronto y
 * más fino después, sin que en ningún momento se le presente ruido como señal.
 */
export function calcularHorarios(
  posts: readonly PostUbicado[],
  base: BaseDeCalculo,
): ResultadoHorarios {
  const nTotal = posts.length;
  if (nTotal === 0) return { modo: "cold", base, nTotal, celdas: [] };
  if (nTotal < N_MINIMO_RED) return { modo: "poca", base, nTotal, celdas: [] };

  const promedioGeneral = media(posts.map((post) => post.valor));
  // Un promedio general de 0 significa que nadie interactuó con nada. No es un
  // error, pero dividir entre él daría infinito: no hay "+%" contra la nada.
  if (promedioGeneral <= 0) return { modo: "poca", base, nTotal, celdas: [] };

  const porFranja = agrupar(posts, (post) => `${post.franja}`);
  const porCelda = agrupar(posts, (post) => `${post.diaSemana}:${post.franja}`);

  const promedioDeFranja = new Map<number, number>();
  for (const [clave, grupo] of porFranja) {
    if (grupo.length < N_MINIMO_GRUPO) continue;
    promedioDeFranja.set(Number(clave), media(grupo.map((p) => p.valor)));
  }

  // Si ninguna franja alcanzó el umbral, hay datos pero no hay nada honesto que
  // decir todavía: es el estado "poca", no un heatmap de ceros.
  if (promedioDeFranja.size === 0) return { modo: "poca", base, nTotal, celdas: [] };

  /**
   * El promedio del que sale TODO lo que la celda dice: su color y su número.
   *
   * Que sea uno solo es la parte que importa. Con dos fuentes distintas una
   * celda podía pintarse al máximo por un único post viral y a la vez mostrar
   * un "+%" heredado y modesto — el color gritando "tu mejor horario" y el
   * tooltip diciendo "esto es el promedio de la franja". Dos afirmaciones
   * contradictorias de la misma celda.
   */
  const promedioDeCelda = (diaSemana: number, franja: number): number | null => {
    const grupo = porCelda.get(`${diaSemana}:${franja}`) ?? [];
    if (grupo.length >= N_MINIMO_GRUPO) return media(grupo.map((p) => p.valor));
    return promedioDeFranja.get(franja) ?? null;
  };

  /**
   * La escala del color se calibra solo con grupos que pasaron el umbral.
   *
   * Sin esto, una celda de un solo post que se hizo viral fija el máximo y
   * aplasta a todas las bien muestreadas contra el tono más bajo: el heatmap
   * terminaría recomendando la hora del accidente.
   */
  const maximo = Math.max(
    ...[...porCelda.values()]
      .filter((grupo) => grupo.length >= N_MINIMO_GRUPO)
      .map((grupo) => media(grupo.map((p) => p.valor))),
    ...promedioDeFranja.values(),
  );

  const celdas: CeldaHorario[] = [];
  for (let diaSemana = 0; diaSemana < 7; diaSemana++) {
    for (let franja = 0; franja < FRANJAS.length; franja++) {
      const grupo = porCelda.get(`${diaSemana}:${franja}`) ?? [];
      const referencia = promedioDeCelda(diaSemana, franja);
      celdas.push({
        diaSemana,
        franja,
        n: grupo.length,
        // Una celda donde nunca se publicó queda en 0 aunque su franja tenga
        // número: el color dice "acá no hay historia", el "+%" dice "si
        // publicas acá, esto es lo que la franja rinde". No es lo mismo.
        intensidad: grupo.length === 0 || referencia === null ? 0 : escalaDe(referencia, maximo),
        lift: referencia === null ? null : lift(referencia, promedioGeneral),
        heredado: grupo.length < N_MINIMO_GRUPO && referencia !== null,
      });
    }
  }

  return { modo: "full", base, nTotal, celdas };
}

function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

/** Porcentaje entero contra el promedio general. Puede ser negativo. */
function lift(promedioGrupo: number, promedioGeneral: number): number {
  return Math.round((promedioGrupo / promedioGeneral - 1) * 100);
}

/**
 * Escala 1–4 para el color de la celda.
 *
 * El `0` no se produce acá: lo reserva el llamador para "sin publicaciones".
 * Una celda con posts que rindieron mal se pinta con el primer tono, no con el
 * de vacío — son cosas distintas y el heatmap no debe confundirlas.
 */
function escalaDe(promedio: number, maximo: number): number {
  if (maximo <= 0) return 1;
  return Math.max(1, Math.min(4, Math.ceil((promedio / maximo) * 4)));
}

function agrupar<T>(items: readonly T[], clave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const k = clave(item);
    const grupo = mapa.get(k);
    if (grupo) grupo.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}
