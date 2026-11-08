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
/**
 * El texto que "Explorar en Chat" deja en el composer desde una tendencia
 * (F12.5, absorbe el backlog "Tarjetas de tendencia → Explorar en Chat").
 *
 * A diferencia de la propuesta, la tendencia es un TEMA, no una publicación:
 * por eso pregunta qué hacer con ella en vez de pedir que la cree. La red y el
 * formato van como dónde se está moviendo, no como orden: el creator decide.
 */
export function promptDeTendencia(item: TrendItem): string {
  return [
    `Quiero aprovechar esta tendencia de mi nicho: ${item.topic} (visto en ${item.sourceTitle}).`,
    "",
    item.blurb,
    "",
    `Se está moviendo en ${NETWORK_LABELS[item.network]} como ${formatoEnFrase(item.format)}. ¿Qué publicación me recomiendas hacer con ella?`,
  ].join("\n");
}

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
