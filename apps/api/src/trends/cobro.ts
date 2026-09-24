import type { TendenciasGuardadas } from "./trends.repository.js";

// La regla del cobro del refresco manual (F9.6), en su propio módulo.
//
// Separada del servicio por la misma razón que `metrics/barajar.ts`: importar
// `trends.service.ts` arrastra `env.ts`, que valida el entorno entero al
// cargarse. Una decisión de producto de cuatro líneas no debería necesitar una
// MAIL_FROM configurada para probarse.

/**
 * Si un refresco se cobra.
 *
 * Se cobra **adelantar tendencias que el usuario ya tiene**. Las tres formas
 * de no tenerlas caen del mismo lado:
 *
 * - sin tanda, porque el barrido todavía no llegó;
 * - con la tanda vencida, que es trabajo que el negocio ya le debe;
 * - con una tanda vacía, que es lo que deja un intento que no encontró nada
 *   citable (`marcarIntento` mueve el vencimiento pero no escribe items).
 *
 * Ese tercer caso es el que obliga a mirar `items` y no solo la fecha: sin él,
 * una búsqueda fallida dejaba una tanda "vigente" por 12 horas y el siguiente
 * click cobraba por tendencias que nunca llegaron.
 */
export function esCobrable(tanda: TendenciasGuardadas | null, ahora = new Date()): boolean {
  if (!tanda || tanda.items.length === 0) return false;
  return tanda.expiresAt.getTime() > ahora.getTime();
}
