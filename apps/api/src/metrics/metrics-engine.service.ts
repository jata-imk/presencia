import { Inject, Injectable } from "@nestjs/common";
import { franjaDe, type SocialNetwork } from "@presencia/shared";
import type { Tx } from "../db/db.service.js";
import {
  analizarPeriodo,
  clave,
  contextosDeRed,
  contextoVacio,
  desdeComparables,
  desdePublicaciones,
  kpisDe,
  numerosDe,
  ventanaReferenciaDias,
  type Analisis,
  type ContextoDeRed,
  type KpisDelPeriodo,
  type PostAnalizado,
  type UltimosNumeros,
} from "./analisis.js";
import {
  EDAD_REFERENCIA_HORAS,
  calcularHorarios,
  interaccionesDe,
  valoresDeRed,
  type ModoHorarios,
  type PostComparable,
  type ResultadoHorarios,
} from "./engagement.js";
import { fechaLocal, sumarDias } from "./hora-local.js";
import {
  MetricsReadRepository,
  type FilaPublicacionAnalizable,
  type FilaUltimosNumeros,
} from "./metrics.read.repository.js";

// El motor de métricas: la única capa que convierte filas en conclusiones.
//
// Lo consumen Ritmo (horarios y cadencia) y Analíticas (`analizar` y
// `detalle`, F12). Las dos pantallas hablan del mismo número porque comparten
// los pasos de `engagement.ts` —la fórmula, el filtrado de NULL, la edad de
// referencia, la base y el promedio de una red— y no solo la tabla
// (ADR-022 y su addendum F12). La aritmética de Analíticas vive pura en
// `analisis.ts`; acá solo se lee y se le pasa.
//
// Lo que NO vive acá: nada de HTTP, nada de formato, nada de copy. El motor
// devuelve números y estados; quién los pinta decide cómo se dicen.

/** Ventana de historial del cálculo de horarios. */
export const VENTANA_HORARIOS_DIAS = 30;

/** Semanas que cubre el heatmap de cadencia. */
export const SEMANAS_CADENCIA = 16;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ContextoUsuario {
  /** `users.timezone`. Toda agrupación por hora o por día es local, no UTC. */
  timezone: string;
  /** Inyectable para poder probar con un reloj fijo. */
  ahora: Date;
}

export interface HorariosDeRed extends ResultadoHorarios {
  network: SocialNetwork;
  ventanaDias: number;
}

export interface DiaDeCadencia {
  /** `YYYY-MM-DD` en la zona del usuario. */
  dia: string;
  total: number;
  porRed: Partial<Record<SocialNetwork, number>>;
}

/** `analizar()`: el periodo ya analizado, y sus KPIs para todas o una red. */
export interface AnalisisDelPeriodo {
  analisis: Analisis<FilaPublicacionAnalizable>;
  kpis: (red: SocialNetwork | null) => KpisDelPeriodo;
  /** `false` = nunca publicó nada ("Cero absoluto"), no solo en el periodo. */
  hayPublicaciones: boolean;
}

/** `detalle()`: una publicación, su red y sus hermanas del mismo concepto. */
export interface DetalleDePublicacion {
  post: PostAnalizado<FilaPublicacionAnalizable>;
  contexto: ContextoDeRed;
  hermanas: PostAnalizado<FilaPublicacionAnalizable>[];
}

export interface ResultadoCadencia {
  dias: DiaDeCadencia[];
  total: number;
  rachaActual: number;
  mejorRacha: number;
}

@Injectable()
export class MetricsEngineService {
  constructor(@Inject(MetricsReadRepository) private readonly lecturas: MetricsReadRepository) {}

  /**
   * Mejores horarios de una red.
   *
   * Los cuatro modos que puede devolver son estados distintos del mundo, no
   * grados de un mismo vacío, y la UI los trata diferente:
   *
   * - `cold`: el usuario no publicó nada medible en la ventana.
   * - `no_reporta`: publicó, preguntamos, y la red dijo que no da números
   *   (LinkedIn personal, X). Es un hecho sobre la red, no sobre el usuario, y
   *   por eso no se muestra como "todavía no tienes datos" — nunca los va a
   *   tener ahí.
   * - `poca`: hay números pero ningún grupo llega al umbral.
   * - `full`: hay al menos un "+%" que se sostiene.
   */
  async horariosDe(
    tx: Tx,
    network: SocialNetwork,
    contexto: ContextoUsuario,
  ): Promise<HorariosDeRed> {
    const desde = new Date(contexto.ahora.getTime() - VENTANA_HORARIOS_DIAS * MS_POR_DIA);
    const filas = await this.lecturas.postsComparables(tx, desde, contexto.ahora);
    return this.horariosCon(filas, network, contexto);
  }

  /**
   * Los horarios de VARIAS redes con una sola lectura.
   *
   * `postsComparables` no filtra por red —trae la ventana completa del tenant
   * y el filtrado es en memoria—, así que llamar a `horariosDe` en un bucle
   * repetía la misma query pesada una vez por red y tiraba todos los
   * resultados menos uno. Con cuatro redes conectadas eran cuatro lecturas
   * idénticas.
   */
  async horariosDeVarias(
    tx: Tx,
    redes: readonly SocialNetwork[],
    contexto: ContextoUsuario,
  ): Promise<HorariosDeRed[]> {
    if (redes.length === 0) return [];
    const desde = new Date(contexto.ahora.getTime() - VENTANA_HORARIOS_DIAS * MS_POR_DIA);
    const filas = await this.lecturas.postsComparables(tx, desde, contexto.ahora);
    return redes.map((network) => this.horariosCon(filas, network, contexto));
  }

  /** El cálculo, ya con las filas leídas. Sin DB: es la parte reutilizable. */
  private horariosCon(
    filas: readonly PostComparable[],
    network: SocialNetwork,
    { timezone }: ContextoUsuario,
  ): HorariosDeRed {
    const deLaRed: PostComparable[] = filas.filter((fila) => fila.network === network);

    // `nTotal` va con las publicaciones que SÍ hubo, no con las que trajeron
    // números: en `no_reporta` el usuario publicó veinte veces y decir que
    // analizamos cero lo devuelve al mismo lugar del que `no_reporta` existe
    // para sacarlo ("todavía no tienes historial" cuando sí lo tiene).
    const vacio = (modo: ModoHorarios, nTotal: number): HorariosDeRed => ({
      network,
      ventanaDias: VENTANA_HORARIOS_DIAS,
      modo,
      base: "interacciones",
      nTotal,
      celdas: [],
    });

    if (deLaRed.length === 0) return vacio("cold", 0);

    const conNumeros = deLaRed.filter((post) => interaccionesDe(post) !== null);
    // Publicó y ninguna de sus publicaciones trajo un solo número: la red no
    // reporta. Se distingue de `cold` porque la respuesta al usuario es otra —
    // "seguí publicando" sería mentira, acá no hay nada que esperar.
    if (conNumeros.length === 0) return vacio("no_reporta", deLaRed.length);

    // El mismo paso que usa `analizar()`: misma base y misma muestra.
    const { base, valores } = valoresDeRed(deLaRed);
    const ubicados = valores.map(({ post, valor }) => {
      const local = fechaLocal(post.publishedAt, timezone);
      return { diaSemana: local.diaSemana, franja: franjaDe(local.hora), valor };
    });

    return {
      network,
      ventanaDias: VENTANA_HORARIOS_DIAS,
      ...calcularHorarios(ubicados, base),
    };
  }

  /**
   * El análisis de Analíticas: el único conjunto de datos del que salen sus
   * endpoints. Tres lecturas, sin importar el periodo; el filtro de red y las
   * rebanadas (resumen, redes, publicaciones) no vuelven a la base.
   */
  async analizar(
    tx: Tx,
    periodoDias: number,
    { ahora }: ContextoUsuario,
  ): Promise<AnalisisDelPeriodo> {
    const desde = desdePublicaciones(ahora, periodoDias);
    // En serie y no con Promise.all: las tres van por el mismo cliente de la
    // transacción, que no corre dos queries a la vez (pg las encola y avisa
    // que en su versión 9 dejará de hacerlo).
    const publicaciones = await this.lecturas.publicacionesAnalizables(tx, desde, ahora);
    const ultimos = await this.lecturas.ultimosNumeros(tx, idsDe(publicaciones));
    const comparables = await this.lecturas.postsComparables(
      tx,
      desdeComparables(ahora, periodoDias),
      ahora,
    );
    const entrada = {
      ahora,
      periodoDias,
      publicaciones,
      ultimos: porClave(ultimos),
      comparables,
    };
    const analisis = analizarPeriodo(entrada);
    const hayPublicaciones =
      publicaciones.length > 0 ? true : await this.lecturas.hayPublicadas(tx);
    return { analisis, kpis: (red) => kpisDe(analisis, entrada, red), hayPublicaciones };
  }

  /**
   * Una publicación con su red y sus hermanas, aunque sea más vieja que el
   * periodo (lore doc §6, "Publicación fuera del periodo"). El promedio es el
   * de la misma ventana de referencia que `analizar`, así que su "sobre tu
   * promedio" es el mismo número que muestra la tabla.
   */
  async detalle(
    tx: Tx,
    cardId: string,
    periodoDias: number,
    { ahora }: ContextoUsuario,
  ): Promise<DetalleDePublicacion | null> {
    const familia = await this.lecturas.publicacionYHermanas(tx, cardId);
    const propia = familia.find((fila) => fila.cardId === cardId);
    if (!propia) return null;

    const desdeReferencia = new Date(
      ahora.getTime() - ventanaReferenciaDias(periodoDias) * MS_POR_DIA,
    );
    const ids = idsDe(familia);
    const tiempos = familia.map((fila) => fila.publishedAt.getTime());
    const masVieja = Math.min(...tiempos);
    const referencia = await this.lecturas.postsComparables(tx, desdeReferencia, ahora);
    const ultimos = await this.lecturas.ultimosNumeros(tx, ids);
    // Los puntos de 24 h de la familia, si alguna quedó fuera de la ventana.
    const propios =
      masVieja < desdeReferencia.getTime()
        ? await this.lecturas.postsComparables(
            tx,
            new Date(masVieja),
            new Date(Math.max(...tiempos) + EDAD_REFERENCIA_HORAS * 3600_000),
            // Solo la familia: sin esto, una hermana de hace seis meses leía
            // seis meses de mediciones de toda la cuenta.
            ids,
          )
        : [];

    const contextos = contextosDeRed(referencia, ahora, periodoDias);
    const comparables = new Map(
      [...referencia, ...propios].map((post) => [clave(post.network, post.platformPostId), post]),
    );
    const numeros = porClave(ultimos);
    const analizar = (
      fila: FilaPublicacionAnalizable,
    ): PostAnalizado<FilaPublicacionAnalizable> => {
      const llave = fila.platformPostId ? clave(fila.network, fila.platformPostId) : null;
      return {
        publicacion: fila,
        ...numerosDe(
          fila,
          llave ? numeros.get(llave) : undefined,
          llave ? comparables.get(llave) : undefined,
          contextos.get(fila.network) ?? contextoVacio(fila.network),
          ahora,
        ),
      };
    };

    return {
      post: analizar(propia),
      contexto: contextos.get(propia.network) ?? contextoVacio(propia.network),
      hermanas: familia.filter((fila) => fila.cardId !== cardId).map(analizar),
    };
  }

  /**
   * El heatmap de cadencia: cuántas publicaciones por día local.
   *
   * Devuelve la rejilla completa —incluidos los días en cero— porque el
   * heatmap necesita pintar los huecos, y reconstruirlos en el cliente
   * obligaría a repetir ahí la aritmética de zona horaria.
   */
  async cadencia(tx: Tx, { timezone, ahora }: ContextoUsuario): Promise<ResultadoCadencia> {
    const hoy = fechaLocal(ahora, timezone);
    // La rejilla arranca en el lunes de la semana de hace N semanas, para que
    // cada columna del heatmap sea una semana completa.
    const primerDia = sumarDias(hoy.dia, -(hoy.diaSemana + (SEMANAS_CADENCIA - 1) * 7));
    // Un día de colchón hacia atrás. Lo necesitan las zonas al ESTE de
    // Greenwich: la medianoche local del primer día en Tokio es las 15:00Z del
    // día ANTERIOR, así que sin colchón se perderían sus primeras horas. Al
    // oeste el problema no existe (en Mérida esa medianoche son las 06:00Z del
    // mismo día, ya cubiertas). Traer de más es inocuo — el agrupado por día
    // local descarta lo que sobre.
    const desde = new Date(Date.parse(`${primerDia}T00:00:00Z`) - MS_POR_DIA);

    const filas = await this.lecturas.publicacionesPublicadas(tx, desde, ahora);
    const conteos = new Map<string, DiaDeCadencia>();
    for (const fila of filas) {
      const local = fechaLocal(fila.publishedAt, timezone);
      if (local.dia < primerDia || local.dia > hoy.dia) continue;
      const dia = conteos.get(local.dia) ?? { dia: local.dia, total: 0, porRed: {} };
      dia.total += 1;
      dia.porRed[fila.network] = (dia.porRed[fila.network] ?? 0) + 1;
      conteos.set(local.dia, dia);
    }

    const dias: DiaDeCadencia[] = [];
    for (let dia = primerDia; dia <= hoy.dia; dia = sumarDias(dia, 1)) {
      dias.push(conteos.get(dia) ?? { dia, total: 0, porRed: {} });
    }

    return {
      dias,
      total: dias.reduce((suma, dia) => suma + dia.total, 0),
      rachaActual: rachaActual(dias),
      mejorRacha: mejorRacha(dias),
    };
  }
}

function porClave(filas: readonly FilaUltimosNumeros[]): Map<string, UltimosNumeros> {
  return new Map(
    filas.map(({ network, platformPostId, ...numeros }) => [
      clave(network, platformPostId),
      numeros,
    ]),
  );
}

function idsDe(filas: readonly { platformPostId: string | null }[]): string[] {
  return filas.flatMap((fila) => (fila.platformPostId ? [fila.platformPostId] : []));
}

/**
 * Días consecutivos publicando, contando hacia atrás.
 *
 * Si hoy todavía no hay nada, la racha se mide desde ayer y sigue viva: el día
 * no terminó y el usuario aún puede publicar. Cortarla a las 00:01 sería
 * castigarlo por no haber publicado a medianoche, que es exactamente el tipo
 * de contador que la gente aprende a odiar.
 */
function rachaActual(dias: readonly DiaDeCadencia[]): number {
  let indice = dias.length - 1;
  if (dias[indice]?.total === 0) indice -= 1;
  let racha = 0;
  while ((dias[indice]?.total ?? 0) > 0) {
    racha += 1;
    indice -= 1;
  }
  return racha;
}

function mejorRacha(dias: readonly DiaDeCadencia[]): number {
  let mejor = 0;
  let corriendo = 0;
  for (const dia of dias) {
    corriendo = dia.total > 0 ? corriendo + 1 : 0;
    if (corriendo > mejor) mejor = corriendo;
  }
  return mejor;
}
