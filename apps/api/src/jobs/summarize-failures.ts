// Cuántos ids caben en el mensaje de error de un pase fallido. El resto se
// resume: el mensaje termina en `pgboss.job.output`, y un pase que falla para
// todos los usuarios —la base caída, el túnel cortado— guardaría una lista
// proporcional a la tabla entera en cada corrida.
const MAX_IDS_EN_MENSAJE = 10;

/**
 * Mensaje de fallo de un pase por lotes, acotado.
 *
 * `unidad` existe porque no todos los pases iteran usuarios: el de tendencias
 * itera tuplas (vertical/país/región). Con el sustantivo fijo, el único lugar
 * donde un operador mira —`pgboss.job.output`— nombraba la unidad equivocada.
 */
export function summarizeFailures(
  what: string,
  failed: readonly string[],
  unidad = "usuario(s)",
): string {
  const shown = failed.slice(0, MAX_IDS_EN_MENSAJE).join(", ");
  const rest = failed.length - MAX_IDS_EN_MENSAJE;
  return `${what} falló para ${failed.length} ${unidad}: ${shown}${rest > 0 ? ` y ${rest} más` : ""}`;
}
