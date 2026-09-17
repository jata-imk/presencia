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

/** `null` si el payload no es de este contrato — un NOTIFY a mano mal escrito no tumba el listener. */
export function decodeCardChanged(payload: string | undefined): CardChanged | null {
  const [userId, cardId, extra] = (payload ?? "").split(":");
  if (extra !== undefined || !userId || !cardId) return null;
  if (!UUID.test(userId) || !UUID.test(cardId)) return null;
  return { userId, cardId };
}
