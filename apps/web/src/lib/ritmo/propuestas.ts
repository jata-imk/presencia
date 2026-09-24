import {
  TREND_FORMAT_LABELS,
  type TrendFormat,
  type TrendItem,
  type TrendProposal,
} from "@presencia/shared";
import { NETWORK_LABELS } from "../network-labels.js";

// De tendencia a acción: qué propuestas se muestran y con qué texto arrancan
// el chat. Puro para poder probarlo sin montar Ritmo ni Chats.

/** Una tendencia que trae su propuesta de publicación. */
export type ConPropuesta = TrendItem & { propuesta: TrendProposal };

/** Cuántas propuestas caben en la sección: una fila de tres, como el mock. */
export const MAX_PROPUESTAS = 3;

/**
 * Las propuestas a mostrar, prefiriendo formatos distintos.
 *
 * Tres Reels seguidos se leen como una sola idea repetida. Primero se toma la
 * primera de cada formato, en el orden de la tanda (el modelo pone primero lo
 * que más se mueve); si no alcanza, se completa con las que sigan.
 */
export function elegirPropuestas(items: readonly TrendItem[]): ConPropuesta[] {
  const con = items.filter((item): item is ConPropuesta => item.propuesta !== undefined);
  const formatos = new Set<TrendFormat>();
  const elegidas: ConPropuesta[] = [];
  for (const item of con) {
    if (elegidas.length === MAX_PROPUESTAS) break;
    if (formatos.has(item.format)) continue;
    formatos.add(item.format);
    elegidas.push(item);
  }
  for (const item of con) {
    if (elegidas.length === MAX_PROPUESTAS) break;
    if (!elegidas.includes(item)) elegidas.push(item);
  }
  // Se devuelven en el orden de la tanda, no en el de la elección.
  return con.filter((item) => elegidas.includes(item));
}

/** "un reel", "una historia": el formato como se dice en una frase. */
function formatoEnFrase(format: TrendFormat): string {
  const nombre = TREND_FORMAT_LABELS[format].toLowerCase();
  return format === "historia" ? `una ${nombre}` : `un ${nombre}`;
}

/**
 * El texto que "Crear en Chat" deja escrito en el composer.
 *
 * Es un punto de partida que el usuario ve y puede editar antes de mandar:
 * nada se genera hasta que lo mande. Lleva el formato y la red porque son lo
 * que el Chat necesita para elegir el arquetipo (un Reel es guion, no copy),
 * y la tendencia con su fuente para que el contenido no pierda de dónde salió.
 */
export function promptDePropuesta(item: ConPropuesta): string {
  return [
    `Quiero crear ${formatoEnFrase(item.format)} para ${NETWORK_LABELS[item.network]} con esta idea:`,
    "",
    `Título: ${item.propuesta.titulo}`,
    `Gancho: ${item.propuesta.gancho}`,
    "",
    `Sale de una tendencia de mi nicho: ${item.topic} (visto en ${item.sourceTitle}).`,
  ].join("\n");
}
