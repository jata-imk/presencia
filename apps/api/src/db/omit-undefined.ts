// Object.entries pierde la relación clave→tipo; esta función la conserva
// para que un spread en un .set() de Drizzle siga type-checkeado contra la
// tabla. Usado por los repositories que aceptan un patch parcial
// (brand-voice, profile) — solo las claves explícitamente definidas entran
// al UPDATE; las omitidas dejan su valor actual sin tocar.
export function omitUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
