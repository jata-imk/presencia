import {
  type CalendarDate,
  type ZonedDateTime,
  toCalendarDateTime,
  toTime,
  toZoned,
} from "@internationalized/date";
import type { PublicationCardDto } from "@presencia/shared";
import { dayKey, zonedFromIso } from "./tz.js";

// Mover una publicación de día (F7 PR3): a qué instante va a parar y si eso
// choca con algo.

/**
 * El mínimo de anticipación que exige el backend (CardsService.MIN_LEAD_MS).
 * Se espeja acá para poder decir "no" ANTES de soltar, en vez de dejar que el
 * usuario complete el gesto y recibir un 400 después. Si cambia allá, cambia
 * acá — es el mismo tipo de espejo que lib/motion.ts con los tokens.
 */
export const MIN_LEAD_MS = 5 * 60 * 1000;

/**
 * Mover a otro día conserva la HORA DE PARED, no el instante: arrastrar un
 * post de las 18:00 al martes lo deja a las 18:00 del martes, aunque en el
 * medio haya un cambio de horario de verano y eso sean 23 o 25 horas de
 * diferencia real. Es lo que el usuario ve y lo que espera.
 */
export function movedToDay(
  card: PublicationCardDto,
  day: CalendarDate,
  timeZone: string,
): ZonedDateTime | null {
  if (!card.scheduledAt) return null;
  const original = zonedFromIso(card.scheduledAt, timeZone);
  return toZoned(toCalendarDateTime(day, toTime(original)), timeZone);
}

export type DropVerdict = "valid" | "conflict" | "past";

/**
 * Conflicto = **misma red + mismo día + misma hora exacta**
 * (presencia-calendario.md §3). Multi-canal a la misma hora NO es conflicto:
 * publicar en LinkedIn e Instagram a las 18:00 es multi-canal sano. Mismo día
 * y misma red a horas distintas tampoco.
 *
 * Se compara el instante completo y no "día + hora" por separado: dos cards
 * con el mismo scheduledAt ya son, por definición, el mismo día y la misma
 * hora en cualquier zona.
 */
export function findConflict(
  cards: PublicationCardDto[],
  candidate: { id: string; network: PublicationCardDto["network"]; at: string },
): PublicationCardDto | null {
  return (
    cards.find(
      (other) =>
        other.id !== candidate.id &&
        other.network === candidate.network &&
        other.scheduledAt === candidate.at &&
        // Una cancelada o fallida no ocupa el horario: no se va a publicar.
        (other.status === "scheduled" || other.status === "published"),
    ) ?? null
  );
}

/**
 * Veredicto de soltar `card` en `day`. Un borrador todavía no tiene hora, así
 * que lo único que puede invalidarlo es el pasado — la hora la elige después
 * el drawer, y ahí se vuelve a validar.
 */
export function verdictFor(
  card: PublicationCardDto,
  day: CalendarDate,
  cards: PublicationCardDto[],
  timeZone: string,
  now: Date = new Date(),
  /**
   * Instante destino ya calculado. En vista mes sale de `movedToDay` (se
   * conserva la hora de pared); en semana y día la posición vertical ES la
   * hora, así que quien llama ya lo resolvió y pasarlo evita recalcular algo
   * distinto de lo que el usuario está viendo.
   */
  precomputed?: ZonedDateTime | null,
): DropVerdict {
  const target = precomputed !== undefined ? precomputed : movedToDay(card, day, timeZone);
  if (!target) {
    // Borrador sin hora de destino (vista mes): basta con que el día no haya
    // terminado. La hora la elige después el drawer, y ahí se revalida.
    const endOfDay = day.add({ days: 1 }).toDate(timeZone).getTime() - 1;
    return endOfDay < now.getTime() + MIN_LEAD_MS ? "past" : "valid";
  }
  if (target.toDate().getTime() < now.getTime() + MIN_LEAD_MS) return "past";
  // Un borrador NO puede estar en conflicto, ni siquiera en vista semana
  // donde el gesto sí apunta a una hora: soltar un borrador abre el drawer en
  // vez de programar, así que marcar la columna en ámbar prometería un
  // diálogo de conflicto que nunca va a aparecer. El drawer valida al
  // confirmar, que es cuando la hora se vuelve real.
  if (!card.scheduledAt) return "valid";
  return findConflict(cards, {
    id: card.id,
    network: card.network,
    at: target.toDate().toISOString(),
  })
    ? "conflict"
    : "valid";
}

/** La sugerencia proactiva del modal de conflicto: la misma hora + 30 min. */
export function suggestLater(target: ZonedDateTime): ZonedDateTime {
  return target.add({ minutes: 30 });
}

/**
 * Conflictos ya existentes en el calendario, para marcarlos de forma pasiva
 * (sin que nadie arrastre nada). Devuelve el set de ids involucrados: en un
 * choque, las dos cards se marcan, no solo la segunda.
 */
export function existingConflicts(cards: PublicationCardDto[]): Set<string> {
  const bySlot = new Map<string, PublicationCardDto[]>();
  for (const card of cards) {
    if (!card.scheduledAt) continue;
    if (card.status !== "scheduled" && card.status !== "published") continue;
    const slot = `${card.network}@${card.scheduledAt}`;
    const bucket = bySlot.get(slot);
    if (bucket) bucket.push(card);
    else bySlot.set(slot, [card]);
  }
  const ids = new Set<string>();
  for (const bucket of bySlot.values()) {
    if (bucket.length > 1) for (const card of bucket) ids.add(card.id);
  }
  return ids;
}

/** Los días (en clave `YYYY-MM-DD`) que tienen al menos un conflicto. */
export function conflictDays(cards: PublicationCardDto[], timeZone: string): Set<string> {
  const ids = existingConflicts(cards);
  const days = new Set<string>();
  for (const card of cards) {
    if (!ids.has(card.id) || !card.scheduledAt) continue;
    days.add(dayKey(zonedFromIso(card.scheduledAt, timeZone)));
  }
  return days;
}
