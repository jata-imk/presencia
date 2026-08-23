import type { PublicationCardDto } from "@presencia/shared";
import { dayKey, zonedFromIso } from "./tz.js";

// Agrupación multi-red (presencia-calendario.md §4).
//
// El grupo NO se persiste y no es una tabla: es una propiedad EMERGENTE de
// "estas cards comparten groupId y el mismo scheduled_at exacto". Por eso
// reprogramar una sola red rompe el grupo sin que nadie escriba nada, y
// volver a la hora original lo reconstituye. Derivarlo en cada render es el
// comportamiento correcto, no un atajo.

export interface CalendarEntry {
  /** `card:<id>` o `group:<groupId>@<iso>` — estable entre renders, sirve de key de React. */
  key: string;
  /** ISO UTC compartido por todas las cards de la entrada. */
  scheduledAt: string;
  /** Una sola card, o las N redes del grupo en orden estable. */
  cards: PublicationCardDto[];
  isGroup: boolean;
}

/** Cards del día indexadas por `YYYY-MM-DD`, ya resueltas a entradas de calendario. */
export type EntriesByDay = Map<string, CalendarEntry[]>;

/**
 * Agrupa por (groupId, scheduledAt) y devuelve las entradas de cada día
 * ordenadas por hora. Las cards sin `scheduledAt` se ignoran: no pertenecen
 * a ningún día de la grilla (viven en el panel de borradores).
 */
export function groupByDay(cards: PublicationCardDto[], timeZone: string): EntriesByDay {
  const byDay: EntriesByDay = new Map();
  const groups = new Map<string, CalendarEntry>();

  for (const card of cards) {
    if (!card.scheduledAt) continue;
    const key = dayKey(zonedFromIso(card.scheduledAt, timeZone));
    let entries = byDay.get(key);
    if (!entries) {
      entries = [];
      byDay.set(key, entries);
    }

    // Dos cards del mismo turno de chat programadas a horas distintas NO son
    // un grupo, aunque compartan groupId: la clave incluye el instante.
    const groupKey = card.groupId ? `${card.groupId}@${card.scheduledAt}` : null;
    const existing = groupKey ? groups.get(groupKey) : undefined;
    if (existing) {
      existing.cards.push(card);
      existing.isGroup = true;
      existing.key = `group:${groupKey}`;
      continue;
    }

    const entry: CalendarEntry = {
      key: `card:${card.id}`,
      scheduledAt: card.scheduledAt,
      cards: [card],
      isGroup: false,
    };
    if (groupKey) groups.set(groupKey, entry);
    entries.push(entry);
  }

  for (const entries of byDay.values()) {
    // El orden de llegada ya viene por scheduled_at desde la API; se reordena
    // igual porque la agrupación puede mover una entrada de posición y
    // porque el store admite parches optimistas fuera de orden.
    entries.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }
  return byDay;
}

/** "2 programadas · 1 publicada" — resumen de un grupo con estados mixtos (§4). */
export function summarizeGroupStatuses(cards: PublicationCardDto[]): string {
  const labels: Partial<Record<PublicationCardDto["status"], [string, string]>> = {
    draft: ["borrador", "borradores"],
    scheduled: ["programada", "programadas"],
    published: ["publicada", "publicadas"],
    failed: ["fallida", "fallidas"],
    canceled: ["cancelada", "canceladas"],
  };
  const counts = new Map<PublicationCardDto["status"], number>();
  for (const card of cards) counts.set(card.status, (counts.get(card.status) ?? 0) + 1);

  return [...counts.entries()]
    .map(([status, count]) => {
      const label = labels[status];
      if (!label) return `${count}`;
      return `${count} ${count === 1 ? label[0] : label[1]}`;
    })
    .join(" · ");
}

/**
 * Cap de la celda del mes: "3 posts visibles + chip +N más"
 * (presencia-calendario.md §3). Se cuenta por POST, no por entrada, porque
 * lo que satura la celda son las filas dibujadas — un grupo de 3 redes ocupa
 * tres. Un grupo nunca se parte a la mitad: si la primera entrada ya se pasa
 * del cap, se muestra entera igual. Cortar un grupo destruiría justo la
 * información que el border-left común existe para comunicar.
 */
export function capEntries(
  entries: CalendarEntry[],
  maxRows = 3,
): { visible: CalendarEntry[]; hidden: number } {
  const visible: CalendarEntry[] = [];
  let rows = 0;
  for (const entry of entries) {
    if (visible.length > 0 && rows + entry.cards.length > maxRows) break;
    visible.push(entry);
    rows += entry.cards.length;
  }
  const shown = visible.reduce((total, entry) => total + entry.cards.length, 0);
  const all = entries.reduce((total, entry) => total + entry.cards.length, 0);
  return { visible, hidden: all - shown };
}
