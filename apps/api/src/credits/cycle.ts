// Cálculo puro del ciclo mensual de cuota, sin DB — ancla en el día del mes
// de users.created_at (cada usuario renueva en su propio aniversario, no en
// un corte global del mes). Lo consume CreditsService.ensureCurrentCycle.
// El job de pg-boss de F8 reemplaza el *trigger* (cron en vez de "alguien
// pidió su saldo"), no este cálculo — el ciclo de cada usuario sigue
// anclado a su fecha de alta.

export interface CycleWindow {
  start: Date;
  /** Inicio del siguiente ciclo — exclusivo. */
  end: Date;
}

/** El día `anchor.getUTCDate()` en el mes (year, monthIndex), clampeado al último día de ese mes. */
function cycleStartInMonth(anchor: Date, year: number, monthIndex: number): Date {
  const anchorDay = anchor.getUTCDate();
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDayOfMonth);
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

function addMonths(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

/** La ventana del ciclo mensual vigente en `now`, anclada al día del mes de `anchor`. */
export function currentCycleWindow(anchor: Date, now: Date): CycleWindow {
  let start = cycleStartInMonth(anchor, now.getUTCFullYear(), now.getUTCMonth());
  if (start > now) {
    // El aniversario de este mes todavía no llega: el ciclo vigente empezó el mes anterior.
    const prev = addMonths(now.getUTCFullYear(), now.getUTCMonth(), -1);
    start = cycleStartInMonth(anchor, prev.year, prev.monthIndex);
  }
  const next = addMonths(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const end = cycleStartInMonth(anchor, next.year, next.monthIndex);
  return { start, end };
}
