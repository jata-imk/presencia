import { sql } from "drizzle-orm";

/**
 * `now()` de Postgres como ISO 8601 en UTC con milisegundos
 * ("2026-11-11T20:00:00.123Z"), el formato que entiende `Date.parse`.
 *
 * F12.5: lo que se compara contra `updated_at` (de la voz o de las versiones de
 * una card) se fecha con este reloj y no con el de la app: con dos relojes, un
 * desfase entre el servidor y la base prendía o escondía avisos en falso. Uno
 * solo para que los dos lugares que lo usan no se separen.
 */
export const ahoraIso = () =>
  sql<string>`to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
