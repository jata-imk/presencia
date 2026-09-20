import { Inject, Injectable } from "@nestjs/common";
import type { SocialNetwork } from "@presencia/shared";
import type { Tx } from "../db/db.service.js";
import {
  baseDeRed,
  calcularHorarios,
  franjaDe,
  interaccionesDe,
  valorDe,
  type ModoHorarios,
  type PostComparable,
  type ResultadoHorarios,
} from "./engagement.js";
import { fechaLocal } from "./hora-local.js";
import { MetricsReadRepository } from "./metrics.read.repository.js";

// El motor de métricas: la única capa que convierte filas en conclusiones.
//
// Ritmo lo consume hoy; Analíticas lo va a consumir después con otras
// agregaciones (por post, por red, por concepto multi-red). La frontera se
// traza ahora —la fórmula, el filtrado de NULL, la edad de referencia— y las
// agregaciones se agregan cuando exista pantalla que las valide: infra "por si
// acaso" es justo lo que el proyecto no construye.
//
// Lo que NO vive acá: nada de HTTP, nada de formato, nada de copy. El motor
// devuelve números y un `modo`; quién los pinta decide cómo se dicen.

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
    { timezone, ahora }: ContextoUsuario,
  ): Promise<HorariosDeRed> {
    const desde = new Date(ahora.getTime() - VENTANA_HORARIOS_DIAS * MS_POR_DIA);
    const filas = await this.lecturas.postsComparables(tx, desde, ahora);
    const deLaRed: PostComparable[] = filas.filter((fila) => fila.network === network);

    const vacio = (modo: ModoHorarios): HorariosDeRed => ({
      network,
      ventanaDias: VENTANA_HORARIOS_DIAS,
      modo,
      base: "interacciones",
      nTotal: 0,
      celdas: [],
    });

    if (deLaRed.length === 0) return vacio("cold");

    const conNumeros = deLaRed.filter((post) => interaccionesDe(post) !== null);
    // Publicó y ninguna de sus publicaciones trajo un solo número: la red no
    // reporta. Se distingue de `cold` porque la respuesta al usuario es otra —
    // "seguí publicando" sería mentira, acá no hay nada que esperar.
    if (conNumeros.length === 0) return vacio("no_reporta");

    const base = baseDeRed(deLaRed);
    const ubicados = conNumeros.flatMap((post) => {
      const valor = valorDe(post, base);
      if (valor === null) return [];
      const local = fechaLocal(post.publishedAt, timezone);
      return [{ diaSemana: local.diaSemana, franja: franjaDe(local.hora), valor }];
    });

    return {
      network,
      ventanaDias: VENTANA_HORARIOS_DIAS,
      ...calcularHorarios(ubicados, base),
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
    // Un día de colchón hacia atrás: el instante de la medianoche local del
    // primer día cae en el día UTC anterior para cualquier zona al oeste de
    // Greenwich. Traer de más es inocuo — el agrupado por día local descarta
    // lo que sobre.
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

/** Suma días a un `YYYY-MM-DD` tratándolo como fecha de calendario, no instante. */
function sumarDias(dia: string, cantidad: number): string {
  const fecha = new Date(Date.parse(`${dia}T00:00:00Z`) + cantidad * MS_POR_DIA);
  return fecha.toISOString().slice(0, 10);
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
