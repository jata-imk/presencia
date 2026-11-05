// Las reglas de una nota de voz (F11, ADR-030), sin dependencias: las leen el
// copy del bot, el servicio de transcripción y los tests.

/** Lo más larga que se transcribe una nota. Una más larga recibe un aviso, sin cobro. */
export const MAX_VOICE_SECONDS = 600;

/** Minutos que se cobran: por minuto iniciado, y al menos uno (Telegram redondea a segundos enteros). */
export function billedMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
