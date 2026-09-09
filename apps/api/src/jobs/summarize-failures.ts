// Cuántos ids caben en el mensaje de error de un pase fallido. El resto se
// resume: el mensaje termina en `pgboss.job.output`, y un pase que falla para
// todos los usuarios —la base caída, el túnel cortado— guardaría una lista
// proporcional a la tabla entera en cada corrida.
const MAX_IDS_EN_MENSAJE = 10;

/** Mensaje de fallo de un pase por lotes, acotado. */
export function summarizeFailures(what: string, failed: readonly string[]): string {
  const shown = failed.slice(0, MAX_IDS_EN_MENSAJE).join(", ");
  const rest = failed.length - MAX_IDS_EN_MENSAJE;
  return `${what} falló para ${failed.length} usuario(s): ${shown}${rest > 0 ? ` y ${rest} más` : ""}`;
}
