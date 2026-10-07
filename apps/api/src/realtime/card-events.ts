// Contrato del puente NOTIFY/LISTEN de cards (F8.6, addendum de ADR-006).
//
// Toda escritura de publication_cards (cards.repository.ts) hace
// `pg_notify(CARD_CHANGED_CHANNEL, "<userId>:<cardId>")` dentro de su misma
// transacción: Postgres solo entrega la notificación si hay COMMIT, así que
// nunca se avisa de algo que no quedó guardado. La API la escucha
// (card-listener.service.ts) aunque la escritura la haya hecho el worker, que
// corre en otro contenedor.
//
// El payload lleva solo ids a propósito. Postgres limita el payload a 8 KB,
// pero la razón de fondo es otra: el objeto que ve el navegador lo arma una
// sola ruta (`CardsService.findDto`, con el RLS del usuario), no dos que se
// puedan desalinear.

export const CARD_CHANGED_CHANNEL = "card_changed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CardChanged {
  userId: string;
  cardId: string;
}

export function encodeCardChanged({ userId, cardId }: CardChanged): string {
  return `${userId}:${cardId}`;
}

/** "<userId>:<id>", los dos uuid; `null` si no — un NOTIFY a mano mal escrito no tumba el listener. */
function decodeIdPair(payload: string | undefined): [string, string] | null {
  const [userId, id, extra] = (payload ?? "").split(":");
  if (extra !== undefined || !userId || !id) return null;
  if (!UUID.test(userId) || !UUID.test(id)) return null;
  return [userId, id];
}

/** `null` si el payload no es de este contrato. */
export function decodeCardChanged(payload: string | undefined): CardChanged | null {
  const pair = decodeIdPair(payload);
  return pair ? { userId: pair[0], cardId: pair[1] } : null;
}

// F10.8: el mismo puente para los chats. Hoy lo usa el título (el automático
// y el que escribe el creator), para que el sidebar de todas sus pestañas lo
// vea sin recargar. Mismo formato de payload, otro canal: un NOTIFY de cards
// nunca se confunde con uno de chats.
export const CHAT_CHANGED_CHANNEL = "chat_changed";

export interface ChatChanged {
  userId: string;
  chatId: string;
}

export function encodeChatChanged({ userId, chatId }: ChatChanged): string {
  return `${userId}:${chatId}`;
}

export function decodeChatChanged(payload: string | undefined): ChatChanged | null {
  const pair = decodeIdPair(payload);
  return pair ? { userId: pair[0], chatId: pair[1] } : null;
}
