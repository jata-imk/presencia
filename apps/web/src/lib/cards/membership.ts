import type { PublicationCardDto } from "@presencia/shared";
import type { CalendarFilters } from "../cards-api.js";

// Reglas de pertenencia del store normalizado (F8.6, ADR-018 addendum).
//
// Cuando una card cambia (respuesta de una mutación, evento SSE), el store
// actualiza la entidad y además tiene que decidir si sigue perteneciendo a
// cada vista que la muestra: la bandeja de borradores, el rango del
// Calendario. Estas funciones son espejo EXACTO de las consultas del
// servidor —`listDrafts` y `listByRange` en cards.repository.ts—; si una de
// esas cambia, cambia acá también, o la vista y el servidor discrepan hasta
// la siguiente recarga.
//
// La pertenencia al chat no vive acá: `chatId` no cambia nunca, así que una
// card de un chat ya cargado solo puede entrar (al crearse), nunca salir.

export interface RangeQuery {
  from: Date;
  to: Date;
  filters: CalendarFilters;
}

/**
 * `true`/`false` cuando se puede decidir en el cliente; `"unknown"` cuando
 * no — hoy solo el filtro de carpeta con un chat que el cliente no conoce.
 * Quien recibe `"unknown"` no adivina: vuelve a pedir la vista.
 */
export type Membership = boolean | "unknown";

/** `listDrafts`: status draft y sin fecha. */
export function belongsToDrafts(card: PublicationCardDto): boolean {
  return card.status === "draft" && card.scheduledAt === null;
}

/**
 * `listByRange`: `scheduled_at` dentro de [from, to] (inclusivo en los dos
 * extremos), más los filtros de estado y red. La carpeta llega por un INNER
 * JOIN con chats, así que una card huérfana (chatId null) nunca entra con
 * ese filtro puesto.
 *
 * `folderOfChat` devuelve la carpeta del chat (`null` = sin carpeta) o
 * `undefined` si el cliente no conoce ese chat (archivado, o la lista de
 * chats todavía no cargó).
 */
export function belongsToRange(
  card: PublicationCardDto,
  query: RangeQuery,
  folderOfChat: (chatId: string) => string | null | undefined,
): Membership {
  if (card.scheduledAt === null) return false;
  const at = Date.parse(card.scheduledAt);
  if (at < query.from.getTime() || at > query.to.getTime()) return false;
  const { status, network, folderId } = query.filters;
  if (status?.length && !status.includes(card.status)) return false;
  if (network?.length && !network.includes(card.network)) return false;
  if (folderId) {
    if (card.chatId === null) return false;
    const folder = folderOfChat(card.chatId);
    if (folder === undefined) return "unknown";
    return folder === folderId;
  }
  return true;
}

/**
 * ¿`incoming` puede reemplazar a `current`? Solo si no es más vieja. Empate
 * gana la que llega: el optimismo del Calendario escribe copias con el mismo
 * `updatedAt` (cambia `scheduledAt` antes de que responda el servidor) y
 * tienen que aplicarse.
 */
export function isNotOlder(incoming: PublicationCardDto, current: PublicationCardDto): boolean {
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt);
}

/**
 * Orden de `listByRange`: por `scheduledAt` ascendente. El servidor desempata
 * por `createdAt`, que el DTO no trae; acá el empate conserva el orden en que
 * ya estaban (sort estable), que en la práctica es el del servidor.
 */
export function sortByScheduledAt(
  ids: string[],
  byId: Record<string, PublicationCardDto>,
): string[] {
  const at = (id: string) => {
    const scheduledAt = byId[id]?.scheduledAt;
    return scheduledAt ? Date.parse(scheduledAt) : Number.POSITIVE_INFINITY;
  };
  return [...ids].sort((a, b) => at(a) - at(b));
}
