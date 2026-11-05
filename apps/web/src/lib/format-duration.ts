/**
 * Segundos como "m:ss" (F11 PR7a): la duración de una nota de voz ("0:42") y
 * la cuenta regresiva del enlace de Telegram ("14:32"). Redondea hacia arriba,
 * para que una cuenta regresiva no diga "0:00" mientras todavía queda algo.
 */
export function formatMinSec(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min)}:${String(sec).padStart(2, "0")}`;
}
