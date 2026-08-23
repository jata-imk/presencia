import { getLocalTimeZone } from "@internationalized/date";
import { authClient } from "../auth-client.js";

/**
 * La zona horaria del usuario (`users.timezone`, ej. America/Merida).
 *
 * Sale de la sesión y no de un fetch propio: `timezone` ya es un
 * additionalField de Better Auth (lib/auth-client.ts) y el shell ya tiene la
 * sesión montada. El fallback a la zona del navegador cubre el instante en
 * que la sesión todavía resuelve.
 *
 * Vive aparte de tz.ts para que aquel módulo quede sin dependencias de React
 * ni de la sesión: la aritmética de fechas es lo que más conviene poder
 * ejercitar fuera del navegador.
 */
export function useTimezone(): string {
  const { data } = authClient.useSession();
  return data?.user.timezone ?? getLocalTimeZone();
}
