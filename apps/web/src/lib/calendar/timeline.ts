import {
  type CalendarDate,
  type ZonedDateTime,
  Time,
  toCalendarDateTime,
  toZoned,
} from "@internationalized/date";
import type { PublicationCardDto } from "@presencia/shared";
import type { CalendarEntry } from "./group.js";
import { zonedFromIso } from "./tz.js";

// Geometría del eje horario de las vistas Semana y Día (F7 PR4).
//
// Todo acá es aritmética pura sobre minutos desde la medianoche: la conversión
// a instante real la hace `instantAt`, que es el único punto que toca la zona
// horaria del usuario.

/** Alto de una hora, en píxeles. Es el que fija la escala de todo lo demás. */
export const HOUR_HEIGHT = 52;

/**
 * Eje de 24 horas completas. La spec dibujaba 6:00–23:00, pero recortar
 * significa que una publicación programada a las 02:00 sería invisible acá y
 * visible en vista mes — la misma card existiendo o no según dónde la mires.
 * En vez de recortar, la vista abre desplazada (ver `initialScrollTop`).
 */
export const DAY_MINUTES = 24 * 60;

/**
 * Un post no tiene duración: ocupa una hora de alto por convención visual, que
 * es lo que hacía el diseño. Este número también define qué se considera
 * "solapado" a la hora de repartir carriles.
 */
export const BLOCK_MINUTES = 60;

/** El arrastre imanta al cuarto de hora: alcanzable con el mouse y suficientemente fino. */
export const SNAP_MINUTES = 15;

/**
 * Ese mismo paso, en píxeles. Los destinos con eje horario lo declaran en
 * `data-drop-time` para que el motor del arrastre re-renderice exactamente
 * cuando cambia el paso imantado. Con un umbral en píxeles sueltos, el
 * preview y el resultado podían discrepar —la franja anunciando 01:45
 * mientras la card caía a las 02:00—, porque el drop usa el offset exacto y
 * el preview uno redondeado por otro criterio.
 */
export const SNAP_PX = (SNAP_MINUTES / 60) * HOUR_HEIGHT;

export function minutesOf(value: ZonedDateTime): number {
  return value.hour * 60 + value.minute;
}

/** Minutos desde medianoche → píxeles desde el borde superior del eje. */
export function topFor(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT;
}

/** Píxeles dentro del eje → minutos, imantado al cuarto de hora y acotado al día. */
export function minutesFromOffset(offsetY: number): number {
  const raw = (offsetY / HOUR_HEIGHT) * 60;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(Math.max(snapped, 0), DAY_MINUTES - SNAP_MINUTES);
}

/** Día + minutos desde medianoche → instante real en la zona del usuario. */
export function instantAt(day: CalendarDate, minutes: number, timeZone: string): ZonedDateTime {
  return toZoned(
    toCalendarDateTime(day, new Time(Math.floor(minutes / 60), minutes % 60)),
    timeZone,
  );
}

/**
 * Dónde dejar el scroll al abrir: unas dos horas antes de ahora, para que lo
 * inmediato quede arriba de la vista sin esconder lo que acaba de pasar. Si es
 * muy temprano, no tiene sentido desplazar nada.
 */
export function initialScrollTop(now: ZonedDateTime): number {
  return Math.max(0, topFor(minutesOf(now) - 120));
}

export interface PositionedEntry {
  entry: CalendarEntry;
  minutes: number;
  /** Carril que le tocó, empezando en 0. */
  lane: number;
  /** Cuántos carriles tiene el grupo de solapados al que pertenece. */
  lanes: number;
}

/**
 * Reparte en carriles las entradas que se pisan, como hace cualquier
 * calendario: dos bloques que comparten franja pasan a ocupar media columna
 * cada uno. La alternativa —dejarlos superpuestos— hace que el de atrás sea
 * imposible de leer y casi imposible de agarrar para arrastrarlo.
 *
 * "Se pisan" se mide en PÍXELES y no en minutos. Parece lo mismo —un bloque
 * dura BLOCK_MINUTES— pero no lo es: el bloque declara `minHeight`, no
 * `height`, así que crece con su contenido. Un grupo multi-red de tres redes
 * mide ~66px, o sea más de una hora de eje, e invadía el bloque de la hora
 * siguiente; como los minutos decían que no se pisaban, los dos se dibujaban
 * a ancho completo y quedaban encimados. Midiendo el alto real de cada
 * entrada, comparten carriles cuando de verdad chocan.
 */

// Medidos sobre el markup real de TimelineBlock: la cabecera es
// `px-1.5 pt-1 pb-0.5` con texto de 8.5px, y cada fila `py-0.5` con un logo
// de 12px. No se derivan de nada, así que si ese markup cambia hay que
// ajustarlos acá — si se quedan cortos, `spanOf` subestima el alto y los
// grupos vuelven a encimarse con la hora siguiente, en silencio. Hay una
// nota recíproca en TimelineBlock.tsx.
const GROUP_HEADER_PX = 18;
const GROUP_ROW_PX = 16;

/** Cuántos minutos de eje ocupa una entrada, según lo que mide de verdad. */
function spanOf(entry: CalendarEntry): number {
  const px = entry.isGroup
    ? GROUP_HEADER_PX + GROUP_ROW_PX * entry.cards.length
    : (BLOCK_MINUTES / 60) * HOUR_HEIGHT;
  return Math.max(BLOCK_MINUTES, (px / HOUR_HEIGHT) * 60);
}
export function layoutDay(entries: CalendarEntry[], timeZone: string): PositionedEntry[] {
  const sorted = entries
    .map((entry) => ({ entry, minutes: minutesOf(zonedFromIso(entry.scheduledAt, timeZone)) }))
    .sort((a, b) => a.minutes - b.minutes);

  const positioned: PositionedEntry[] = [];
  // Un "racimo" es una cadena de entradas donde cada una se pisa con la
  // anterior. Todas las del racimo comparten el mismo total de carriles, si no
  // quedarían de anchos distintos sin motivo visible.
  let cluster: PositionedEntry[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    const lanes = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 0);
    for (const item of cluster) item.lanes = lanes;
    positioned.push(...cluster);
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const { entry, minutes } of sorted) {
    if (minutes >= clusterEnd) closeCluster();
    // Primer carril libre: el más a la izquierda cuyo último bloque ya terminó.
    const laneEnds = new Map<number, number>();
    for (const item of cluster) {
      laneEnds.set(
        item.lane,
        Math.max(laneEnds.get(item.lane) ?? -Infinity, item.minutes + spanOf(item.entry)),
      );
    }
    let lane = 0;
    while ((laneEnds.get(lane) ?? -Infinity) > minutes) lane += 1;

    cluster.push({ entry, minutes, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, minutes + spanOf(entry));
  }
  closeCluster();

  return positioned;
}

/** ¿La card ya salió? Lo publicado no se arrastra (mismo criterio que la vista mes). */
export function isMovable(card: PublicationCardDto): boolean {
  return card.status === "scheduled" || card.status === "failed";
}
